import "dotenv/config";
import { statSync } from "node:fs";
import bcrypt from "bcryptjs";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as s from "../src/db/schema";
import { SAMPLE_VOTERS, VOTE_REASONS, sampleVotes, CHANGE_REQUESTS, COMMENT_ANALYSIS, TEAMS, DEFAULT_SETTINGS, UPLOADS, INSIGHTS, PEOPLE, PROPOSALS, SEED_LANGUAGES, SEED_PASSWORD, STREAMS, ageToMs } from "../src/db/seed-data";
import { catalogEntry } from "../src/lib/languages";

const sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
const db = drizzle(sql, { schema: s });
const now = Date.now();
const ago = (age: string) => new Date(now - ageToMs(age));

await sql`truncate users, sessions, user_follows, streams, stream_links, proposals, proposal_versions, proposal_drafts, uploads,
  proposal_streams, follows, comments, team_members, team_roles, team_requests, team_invites, team_blocks, change_requests, proposal_votes, comment_likes, comment_flags, insights, insight_sources, insight_votes,
  settings, languages, translations restart identity cascade`;

await db.insert(s.languages).values(SEED_LANGUAGES.map((code, i) => {
  const l = catalogEntry(code)!;
  return { code, name: l.name, native: l.native, rtl: Boolean(l.rtl), enabled: true, position: i };
}));

await db.insert(s.uploads).values(
  UPLOADS.map((u) => ({ id: u.id, kind: u.kind, name: u.name, contentType: u.contentType, size: statSync(`seed-assets/${u.file}`).size, key: `bundled/${u.file}` })),
);

const hash = await bcrypt.hash(SEED_PASSWORD, 10);
const userRows = await db
  .insert(s.users)
  .values(
    PEOPLE.map((p) => ({
      email: p.email, name: p.name, initials: p.initials, role: p.role, passwordHash: hash,
      title: p.title, org: p.org, location: p.location, bio: p.bio, reads: [...p.reads], strengthsPublic: p.strengthsPublic, createdAt: new Date(p.joined),
    })),
  )
  .returning({ id: s.users.id, email: s.users.email });
const uid = Object.fromEntries(PEOPLE.map((p) => [p.key, userRows.find((u) => u.email === p.email)!.id]));
// Sample citizens who only vote. Their password hash matches no password, and voter-only accounts can't sign in anyway.
const voterIds = (
  await db.insert(s.users).values(SAMPLE_VOTERS.map((v) => ({ ...v, role: "citizen" as const, voterOnly: true, passwordHash: "!", createdAt: new Date("2025-08-01") }))).returning({ id: s.users.id, email: s.users.email })
).sort((a, b) => a.email.localeCompare(b.email)).map((r) => r.id);

await db.insert(s.streams).values(STREAMS.map((st, i) => ({ id: st.id, name: st.name, description: st.desc, color: st.color, active: st.active, position: i })));
const pairs = new Set<string>();
for (const st of STREAMS) for (const r of st.related) pairs.add([st.id, r].sort().join("|"));
await db.insert(s.streamLinks).values([...pairs].map((p) => { const [a, b] = p.split("|"); return { a, b }; }));

await db.insert(s.settings).values(Object.entries(DEFAULT_SETTINGS).map(([key, value]) => ({ key, value })));

// People other than Maya hand out the seeded likes and votes, so Maya starts with nothing liked (as in the design).
const likers = PEOPLE.filter((p) => p.key !== "maya").map((p) => uid[p.key]);
const likeRows = (commentId: string, n: number) => likers.slice(0, n).map((userId) => ({ commentId, userId }));
const analysis = (text: string) => {
  const a = COMMENT_ANALYSIS.find(([prefix]) => text.startsWith(prefix));
  if (!a) return {};
  const [, kind, relevance, flag] = a;
  return { kind: kind as "question", relevance, ...(flag ? { status: "flagged" as const, flagReason: flag, flagSource: "jev" as const } : {}) };
};

for (const p of PROPOSALS) {
  const oldest = p.versions[0]?.age ?? p.draft?.saved ?? p.updated;
  const team = TEAMS[p.key] ?? {};
  const [row] = await db
    .insert(s.proposals)
    .values({
      authorId: uid[p.author], leadId: uid[p.author], createdAt: ago(oldest), updatedAt: ago(p.updated), joinMode: team.mode ?? "roles", teamCap: team.cap ?? null,
      ...(team.offer ? { offerTo: uid[team.offer.to], offerNote: team.offer.note, offerAt: ago(team.offer.age) } : {}),
    })
    .returning({ id: s.proposals.id });
  for (const v of p.versions) {
    await db.insert(s.proposalVersions).values({ proposalId: row.id, number: v.n, title: v.title, summary: v.summary, body: v.body, note: v.note, publishedAt: ago(v.age), language: "en", byId: uid[p.author] });
  }
  await db.insert(s.teamMembers).values([
    { proposalId: row.id, userId: uid[p.author], joinedAt: ago(oldest) },
    ...(team.members ?? []).map(([k, streamId, age]) => ({ proposalId: row.id, userId: uid[k], streamId, joinedAt: ago(age) })),
  ]);
  if (team.roles?.length) await db.insert(s.teamRoles).values(team.roles.map(([streamId, note]) => ({ proposalId: row.id, streamId, note })));
  if (team.requests?.length) await db.insert(s.teamRequests).values(team.requests.map(([k, streamId, note, age]) => ({ proposalId: row.id, userId: uid[k], streamId, note, createdAt: ago(age) })));
  if (team.invites?.length) await db.insert(s.teamInvites).values(team.invites.map(([k, streamId, note, age]) => ({ proposalId: row.id, userId: uid[k], fromId: uid[p.author], streamId, note, createdAt: ago(age) })));
  if (team.declined?.length) await db.insert(s.teamBlocks).values(team.declined.map(([k, age]) => ({ proposalId: row.id, userId: uid[k], declinedAt: ago(age) })));
  for (const cr of CHANGE_REQUESTS.filter((c) => c.proposal === p.key)) {
    const base = p.versions.find((v) => v.n === cr.base)!;
    await db.insert(s.changeRequests).values({ proposalId: row.id, authorId: uid[cr.author], baseVersion: cr.base, title: base.title, summary: base.summary, body: cr.body, note: cr.note, createdAt: ago(cr.age), updatedAt: ago(cr.age) });
  }
  if (p.versions.length) {
    const votes = sampleVotes(p.key, ageToMs(p.versions[0].age) / 86_400_000);
    const reasons = VOTE_REASONS.filter(([k]) => k === p.key);
    const opposed = votes.filter(([, stance]) => stance === "oppose");
    if (votes.length)
      await db.insert(s.proposalVotes).values(votes.map(([i, stance, minutes]) => {
        const r = stance === "oppose" ? reasons[opposed.findIndex((o) => o[0] === i)] : undefined;
        const at = new Date(now - minutes * 60_000);
        return { proposalId: row.id, userId: voterIds[i], stance, createdAt: at, updatedAt: at, ...(r ? { reason: r[1], reasonAt: ago(r[2]) } : {}) };
      }));
  }
  if (p.draft) await db.insert(s.proposalDrafts).values({ proposalId: row.id, title: p.draft.title, summary: p.draft.summary, body: p.draft.body, savedAt: ago(p.draft.saved) });
  await db.insert(s.proposalStreams).values(Object.entries(p.scores).map(([streamId, score]) => ({ proposalId: row.id, streamId, score, authorScore: score })));
  if (p.following) await db.insert(s.follows).values({ userId: uid.maya, proposalId: row.id });
  const commentIds: { id: string; text: string }[] = [];
  for (const c of p.comments) {
    const [cr] = await db.insert(s.comments).values({ proposalId: row.id, authorId: uid[c.author], body: c.text, createdAt: ago(c.age), language: "en", ...analysis(c.text) }).returning({ id: s.comments.id });
    commentIds.push({ id: cr.id, text: c.text });
    if (c.likes) await db.insert(s.commentLikes).values(likeRows(cr.id, c.likes));
    for (const [author, text, age, likes] of c.replies) {
      const [rr] = await db.insert(s.comments).values({ proposalId: row.id, parentId: cr.id, authorId: uid[author], body: text, createdAt: ago(age), language: "en", ...analysis(text) }).returning({ id: s.comments.id });
      commentIds.push({ id: rr.id, text });
      if (likes) await db.insert(s.commentLikes).values(likeRows(rr.id, likes));
    }
  }
  for (const [kind, text, votes, prefixes, answered, relevance] of INSIGHTS[p.key] ?? []) {
    const [ins] = await db
      .insert(s.insights)
      .values({ proposalId: row.id, kind: kind as "concern", text, answered, relevance, relevanceVersion: p.versions.at(-1)?.n ?? null })
      .returning({ id: s.insights.id });
    const sources = prefixes.map((pre) => commentIds.find((c) => c.text.startsWith(pre))!.id);
    await db.insert(s.insightSources).values(sources.map((commentId) => ({ insightId: ins.id, commentId })));
    if (votes) await db.insert(s.insightVotes).values(likers.slice(0, votes).map((userId) => ({ insightId: ins.id, userId })));
  }
}

await sql.end();
console.log(`Seeded ${PEOPLE.length} people, ${SAMPLE_VOTERS.length} sample voters, ${STREAMS.length} streams, ${PROPOSALS.length} proposals`);
