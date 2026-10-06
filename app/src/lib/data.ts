import "server-only";
import { and, asc, desc, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  commentFlags,
  commentLikes,
  comments,
  insightSources,
  insightVotes,
  insights,
  follows,
  proposalDrafts,
  proposalStreams,
  proposalVersions,
  proposals,
  streamLinks,
  streams,
  users,
} from "@/db/schema";
import type { CurrentUser } from "./auth";
import { membershipsOf, teamSizes } from "./team";

export type Stream = { id: string; name: string; description: string; color: string; active: boolean; position: number; related: string[] };

export async function getStreams(): Promise<Stream[]> {
  const [rows, links] = await Promise.all([
    db.select().from(streams).orderBy(asc(streams.position), asc(streams.createdAt)),
    db.select().from(streamLinks),
  ]);
  return rows.map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    color: s.color,
    active: s.active,
    position: s.position,
    related: links.flatMap((l) => (l.a === s.id ? [l.b] : l.b === s.id ? [l.a] : [])),
  }));
}

export type VersionRow = { number: number; title: string; summary: string; body: string; note: string; language: string | null; publishedAt: Date; byId: string | null; withIds: string[] };
export type DraftRow = { title: string; summary: string; body: string; savedAt: Date; note: string; noteAuto: boolean; noteFor: string; summaryAuto: boolean; summaryFor: string; contributors: string[] };
/** The viewer's place on the proposal's team. */
export type TeamRole = "lead" | "member" | null;
export type ScoreRow = { streamId: string; score: number; authorScore: number | null; jevScore: number | null; jevConfidence: number | null };
export type Person = { id: string; name: string; initials: string };

export type ProposalSummary = {
  id: string;
  /** The lead: who edits and publishes, shown as the proposal's name. */
  author: Person;
  teamSize: number;
  role: TeamRole;
  updatedAt: Date;
  latest: VersionRow | null;
  draft: DraftRow | null; // only for the lead, and for team members while nothing is published
  scores: ScoreRow[];
  commentCount: number;
  following: boolean;
};

const versionRow = (v: typeof proposalVersions.$inferSelect): VersionRow => ({
  number: v.number, title: v.title, summary: v.summary, body: v.body, note: v.note, language: v.language, publishedAt: v.publishedAt, byId: v.byId, withIds: v.withIds,
});
const draftRow = (d: typeof proposalDrafts.$inferSelect): DraftRow => ({
  title: d.title, summary: d.summary, body: d.body, savedAt: d.savedAt, note: d.note, noteAuto: d.noteAuto, noteFor: d.noteFor, summaryAuto: d.summaryAuto, summaryFor: d.summaryFor, contributors: d.contributors,
});

/** Proposals the user can see: every published proposal plus drafts of the teams they're on. */
export async function getVisibleProposals(user: CurrentUser): Promise<ProposalSummary[]> {
  const base = await db
    .select({ id: proposals.id, leadId: proposals.leadId, updatedAt: proposals.updatedAt, name: users.name, initials: users.initials })
    .from(proposals)
    .innerJoin(users, eq(users.id, proposals.leadId));
  if (base.length === 0) return [];
  const ids = base.map((p) => p.id);

  const [versions, drafts, scores, counts, follow, mem, sizes] = await Promise.all([
    db.select().from(proposalVersions).where(inArray(proposalVersions.proposalId, ids)),
    db.select().from(proposalDrafts).where(inArray(proposalDrafts.proposalId, ids)),
    db.select().from(proposalStreams).where(inArray(proposalStreams.proposalId, ids)),
    db
      .select({ proposalId: comments.proposalId, n: sql<number>`count(*)::int` })
      .from(comments)
      .where(and(inArray(comments.proposalId, ids), inArray(comments.status, ["visible", "flagged"])))
      .groupBy(comments.proposalId),
    db.select({ proposalId: follows.proposalId }).from(follows).where(eq(follows.userId, user.id)),
    membershipsOf(user.id),
    teamSizes(ids),
  ]);

  const out: ProposalSummary[] = [];
  for (const p of base) {
    const role: TeamRole = mem.lead.has(p.id) ? "lead" : mem.member.has(p.id) ? "member" : null;
    const vs = versions.filter((v) => v.proposalId === p.id).sort((a, b) => a.number - b.number);
    const latest = vs.at(-1) ?? null;
    // Unpublished drafts are visible to the team and to people invited to join it.
    const invited = mem.invited.has(p.id);
    if (!latest && !role && !invited) continue;
    const d = role === "lead" || ((role || invited) && !latest) ? drafts.find((x) => x.proposalId === p.id) : undefined;
    out.push({
      id: p.id,
      author: { id: p.leadId, name: p.name, initials: p.initials },
      teamSize: sizes.get(p.id) ?? 1,
      role,
      updatedAt: p.updatedAt,
      latest: latest && versionRow(latest),
      draft: d ? draftRow(d) : null,
      scores: scores.filter((s) => s.proposalId === p.id).map(({ streamId, score, authorScore, jevScore, jevConfidence }) => ({ streamId, score, authorScore, jevScore, jevConfidence })),
      commentCount: counts.find((c) => c.proposalId === p.id)?.n ?? 0,
      following: follow.some((f) => f.proposalId === p.id),
    });
  }
  return out;
}

export type CommentNode = {
  id: string;
  author: Person;
  body: string;
  createdAt: Date;
  likes: number;
  liked: boolean;
  status: "visible" | "pending" | "flagged" | "removed";
  flagReason: string | null;
  kind: string | null;
  relevance: number | null;
  language: string | null;
  myFlag: string | null;
  replies: CommentNode[];
};

export type InsightItem = {
  id: string;
  kind: "concern" | "suggestion" | "clarification";
  text: string;
  answered: boolean;
  votes: number;
  voted: boolean;
  /** 0–100, how relevant the point is to the proposal; null until Jev has judged it. */
  relevance: number | null;
  sources: { commentId: string; parentId: string | null; firstName: string }[];
};

export type ProposalDetail = {
  id: string;
  /** The lead. */
  author: Person;
  role: TeamRole;
  versions: VersionRow[];
  draft: DraftRow | null;
  scores: ScoreRow[];
  following: boolean;
  comments: CommentNode[];
  insights: InsightItem[];
  /** Some insights haven't been judged against the latest version yet. */
  insightsStale: boolean;
  /** Names of the people credited on versions (who published, and with whom). */
  names: Record<string, string>;
};

/** Returns null when the proposal doesn't exist or is an unpublished draft of a team the user isn't on. */
export async function getProposalDetail(id: string, user: CurrentUser): Promise<ProposalDetail | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [p] = await db
    .select({ id: proposals.id, leadId: proposals.leadId, name: users.name, initials: users.initials })
    .from(proposals)
    .innerJoin(users, eq(users.id, proposals.leadId))
    .where(eq(proposals.id, id))
    .limit(1);
  if (!p) return null;
  const mem = await membershipsOf(user.id);
  const role: TeamRole = mem.lead.has(id) ? "lead" : mem.member.has(id) ? "member" : null;
  const invited = mem.invited.has(id);

  const [versions, draftRows, scores, followRows, cmts] = await Promise.all([
    db.select().from(proposalVersions).where(eq(proposalVersions.proposalId, id)).orderBy(asc(proposalVersions.number)),
    role || invited ? db.select().from(proposalDrafts).where(eq(proposalDrafts.proposalId, id)) : Promise.resolve([]),
    db.select().from(proposalStreams).where(eq(proposalStreams.proposalId, id)),
    db.select().from(follows).where(and(eq(follows.proposalId, id), eq(follows.userId, user.id))),
    db
      .select({
        id: comments.id, parentId: comments.parentId, body: comments.body, createdAt: comments.createdAt, authorId: users.id, name: users.name, initials: users.initials,
        status: comments.status, flagReason: comments.flagReason, kind: comments.kind, relevance: comments.relevance, language: comments.language,
      })
      .from(comments)
      .innerJoin(users, eq(users.id, comments.authorId))
      // Held comments are visible to their author only; removed ones to nobody.
      .where(and(eq(comments.proposalId, id), ne(comments.status, "removed"), or(ne(comments.status, "pending"), eq(comments.authorId, user.id)))),
  ]);
  if (versions.length === 0 && !role && !invited) return null;

  const cids = cmts.map((c) => c.id);
  const [likeRows, myFlags] = cids.length
    ? await Promise.all([
        db.select().from(commentLikes).where(inArray(commentLikes.commentId, cids)),
        db.select().from(commentFlags).where(and(inArray(commentFlags.commentId, cids), eq(commentFlags.userId, user.id))),
      ])
    : [[], []];
  const node = (c: (typeof cmts)[number]): CommentNode => ({
    id: c.id,
    author: { id: c.authorId, name: c.name, initials: c.initials },
    body: c.body,
    createdAt: c.createdAt,
    likes: likeRows.filter((l) => l.commentId === c.id).length,
    liked: likeRows.some((l) => l.commentId === c.id && l.userId === user.id),
    status: c.status,
    flagReason: c.flagReason,
    kind: c.kind,
    relevance: c.relevance,
    language: c.language,
    myFlag: myFlags.find((f) => f.commentId === c.id)?.reason ?? null,
    replies: [],
  });
  // Threads and replies read oldest first, as in the design.
  const top = cmts.filter((c) => !c.parentId).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()).map(node);
  for (const t of top) {
    t.replies = cmts.filter((c) => c.parentId === t.id).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()).map(node);
  }

  // Insights only list sources the viewer can see; an insight with none left is dropped.
  const shown = new Map(cmts.filter((c) => c.status !== "pending").map((c) => [c.id, c]));
  const insightRows = versions.length ? await db.select().from(insights).where(eq(insights.proposalId, id)).orderBy(asc(insights.createdAt)) : [];
  const insightIds = insightRows.map((i) => i.id);
  const [sourceRows, voteRows] = insightIds.length
    ? await Promise.all([
        db.select().from(insightSources).where(inArray(insightSources.insightId, insightIds)),
        db.select().from(insightVotes).where(inArray(insightVotes.insightId, insightIds)),
      ])
    : [[], []];
  const insightList: InsightItem[] = insightRows
    .map((i) => ({
      id: i.id,
      kind: i.kind,
      text: i.text,
      answered: i.answered,
      relevance: i.relevance,
      votes: voteRows.filter((v) => v.insightId === i.id).length,
      voted: voteRows.some((v) => v.insightId === i.id && v.userId === user.id),
      sources: sourceRows
        .filter((s) => s.insightId === i.id && shown.has(s.commentId))
        .map((s) => {
          const c = shown.get(s.commentId)!;
          return { commentId: c.id, parentId: c.parentId, firstName: c.name.split(" ")[0] };
        }),
    }))
    .filter((i) => i.sources.length > 0);

  const credited = [...new Set(versions.flatMap((v) => [v.byId, ...v.withIds]).filter((x): x is string => Boolean(x)))];
  const nameRows = credited.length ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, credited)) : [];
  // Members see the draft only while nothing is published; after that the draft is the lead's work in progress.
  const d = role === "lead" || ((role || invited) && !versions.length) ? draftRows[0] : undefined;
  return {
    id: p.id,
    author: { id: p.leadId, name: p.name, initials: p.initials },
    role,
    versions: versions.map(versionRow),
    draft: d ? draftRow(d) : null,
    scores: scores.map(({ streamId, score, authorScore, jevScore, jevConfidence }) => ({ streamId, score, authorScore, jevScore, jevConfidence })),
    following: followRows.length > 0,
    comments: top,
    insights: insightList,
    insightsStale: insightRows.some((i) => i.relevanceVersion !== versions.at(-1)?.number),
    names: Object.fromEntries(nameRows.map((r) => [r.id, r.name])),
  };
}

/** Published proposal ids with their streams, for the overlap matrix and stream counts. */
export async function getStreamUsage() {
  const [all, published] = await Promise.all([
    db.select({ proposalId: proposalStreams.proposalId, streamId: proposalStreams.streamId }).from(proposalStreams),
    db.selectDistinct({ proposalId: proposalVersions.proposalId }).from(proposalVersions),
  ]);
  const pub = new Set(published.map((p) => p.proposalId));
  const byProposal = new Map<string, Set<string>>();
  for (const r of all) {
    if (!pub.has(r.proposalId)) continue;
    if (!byProposal.has(r.proposalId)) byProposal.set(r.proposalId, new Set());
    byProposal.get(r.proposalId)!.add(r.streamId);
  }
  const countAll = (streamId: string) => all.filter((r) => r.streamId === streamId).length;
  return { publishedSets: [...byProposal.values()], countAll };
}

export type ModerationItem = {
  id: string;
  proposalId: string;
  proposalTitle: string;
  author: string;
  body: string;
  createdAt: Date;
  status: "visible" | "pending" | "flagged";
  flagReason: string | null;
  flagSource: "jev" | "users" | null;
  readerFlags: { reason: string; n: number }[];
};

/** Comments waiting for a moderator: held, hidden, or flagged by at least one reader and not reviewed since. */
export async function getModerationQueue(): Promise<ModerationItem[]> {
  const flagCounts = db
    .select({ commentId: commentFlags.commentId, latest: sql<Date>`max(${commentFlags.createdAt})`.as("latest") })
    .from(commentFlags)
    .groupBy(commentFlags.commentId)
    .as("fc");
  const rows = await db
    .select({
      id: comments.id, proposalId: comments.proposalId, body: comments.body, createdAt: comments.createdAt, status: comments.status,
      flagReason: comments.flagReason, flagSource: comments.flagSource, reviewedAt: comments.reviewedAt, author: users.name, latestFlag: flagCounts.latest,
    })
    .from(comments)
    .innerJoin(users, eq(users.id, comments.authorId))
    .leftJoin(flagCounts, eq(flagCounts.commentId, comments.id))
    .where(
      or(
        inArray(comments.status, ["pending", "flagged"]),
        and(eq(comments.status, "visible"), sql`${flagCounts.latest} is not null`, or(isNull(comments.reviewedAt), sql`${comments.reviewedAt} < ${flagCounts.latest}`)),
      ),
    )
    .orderBy(desc(comments.createdAt));
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const pids = [...new Set(rows.map((r) => r.proposalId))];
  const [reasons, titles] = await Promise.all([
    db.select({ commentId: commentFlags.commentId, reason: commentFlags.reason, n: sql<number>`count(*)::int` }).from(commentFlags).where(inArray(commentFlags.commentId, ids)).groupBy(commentFlags.commentId, commentFlags.reason),
    db.selectDistinctOn([proposalVersions.proposalId], { proposalId: proposalVersions.proposalId, title: proposalVersions.title }).from(proposalVersions).where(inArray(proposalVersions.proposalId, pids)).orderBy(proposalVersions.proposalId, desc(proposalVersions.number)),
  ]);
  return rows.map((r) => ({
    id: r.id,
    proposalId: r.proposalId,
    proposalTitle: titles.find((t) => t.proposalId === r.proposalId)?.title ?? "",
    author: r.author,
    body: r.body,
    createdAt: r.createdAt,
    status: r.status as ModerationItem["status"],
    flagReason: r.flagReason,
    flagSource: r.flagSource,
    readerFlags: reasons.filter((x) => x.commentId === r.id).map(({ reason, n }) => ({ reason, n })),
  }));
}
