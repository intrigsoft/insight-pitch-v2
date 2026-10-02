import "dotenv/config";
import bcrypt from "bcryptjs";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as s from "../src/db/schema";
import { DEFAULT_SETTINGS, PEOPLE, PROPOSALS, SEED_PASSWORD, STREAMS, ageToMs } from "../src/db/seed-data";

const sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
const db = drizzle(sql, { schema: s });
const now = Date.now();
const ago = (age: string) => new Date(now - ageToMs(age));

await sql`truncate users, sessions, streams, stream_links, proposals, proposal_versions, proposal_drafts,
  proposal_streams, follows, comments, comment_likes, settings restart identity cascade`;

const hash = await bcrypt.hash(SEED_PASSWORD, 10);
const userRows = await db
  .insert(s.users)
  .values(PEOPLE.map((p) => ({ email: p.email, name: p.name, initials: p.initials, role: p.role, passwordHash: hash })))
  .returning({ id: s.users.id, email: s.users.email });
const uid = Object.fromEntries(PEOPLE.map((p) => [p.key, userRows.find((u) => u.email === p.email)!.id]));

await db.insert(s.streams).values(STREAMS.map((st, i) => ({ id: st.id, name: st.name, description: st.desc, color: st.color, active: st.active, position: i })));
const pairs = new Set<string>();
for (const st of STREAMS) for (const r of st.related) pairs.add([st.id, r].sort().join("|"));
await db.insert(s.streamLinks).values([...pairs].map((p) => { const [a, b] = p.split("|"); return { a, b }; }));

await db.insert(s.settings).values(Object.entries(DEFAULT_SETTINGS).map(([key, value]) => ({ key, value })));

// People other than Maya hand out the seeded likes, so Maya starts with nothing liked (as in the design).
const likers = PEOPLE.filter((p) => p.key !== "maya").map((p) => uid[p.key]);
const likeRows = (commentId: string, n: number) => likers.slice(0, n).map((userId) => ({ commentId, userId }));

for (const p of PROPOSALS) {
  const oldest = p.versions[0]?.age ?? p.draft?.saved ?? p.updated;
  const [row] = await db.insert(s.proposals).values({ authorId: uid[p.author], createdAt: ago(oldest), updatedAt: ago(p.updated) }).returning({ id: s.proposals.id });
  for (const v of p.versions) {
    await db.insert(s.proposalVersions).values({ proposalId: row.id, number: v.n, title: v.title, summary: v.summary, body: v.body, note: v.note, publishedAt: ago(v.age) });
  }
  if (p.draft) await db.insert(s.proposalDrafts).values({ proposalId: row.id, title: p.draft.title, summary: p.draft.summary, body: p.draft.body, savedAt: ago(p.draft.saved) });
  await db.insert(s.proposalStreams).values(Object.entries(p.scores).map(([streamId, score]) => ({ proposalId: row.id, streamId, score, authorScore: score })));
  if (p.following) await db.insert(s.follows).values({ userId: uid.maya, proposalId: row.id });
  for (const c of p.comments) {
    const [cr] = await db.insert(s.comments).values({ proposalId: row.id, authorId: uid[c.author], body: c.text, createdAt: ago(c.age) }).returning({ id: s.comments.id });
    if (c.likes) await db.insert(s.commentLikes).values(likeRows(cr.id, c.likes));
    for (const [author, text, age, likes] of c.replies) {
      const [rr] = await db.insert(s.comments).values({ proposalId: row.id, parentId: cr.id, authorId: uid[author], body: text, createdAt: ago(age) }).returning({ id: s.comments.id });
      if (likes) await db.insert(s.commentLikes).values(likeRows(rr.id, likes));
    }
  }
}

await sql.end();
console.log(`Seeded ${PEOPLE.length} people, ${STREAMS.length} streams, ${PROPOSALS.length} proposals`);
