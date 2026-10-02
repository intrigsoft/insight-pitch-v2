import "server-only";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  commentLikes,
  comments,
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

export type VersionRow = { number: number; title: string; summary: string; body: string; note: string; publishedAt: Date };
export type DraftRow = { title: string; summary: string; body: string; savedAt: Date };
export type ScoreRow = { streamId: string; score: number; authorScore: number | null; jevScore: number | null; jevConfidence: number | null };
export type Person = { id: string; name: string; initials: string };

export type ProposalSummary = {
  id: string;
  author: Person;
  updatedAt: Date;
  latest: VersionRow | null;
  draft: DraftRow | null; // only loaded for the current user's own proposals
  scores: ScoreRow[];
  commentCount: number;
  following: boolean;
};

/** Proposals the user can see: every published proposal plus their own drafts. */
export async function getVisibleProposals(user: CurrentUser): Promise<ProposalSummary[]> {
  const base = await db
    .select({ id: proposals.id, authorId: proposals.authorId, updatedAt: proposals.updatedAt, name: users.name, initials: users.initials })
    .from(proposals)
    .innerJoin(users, eq(users.id, proposals.authorId));
  if (base.length === 0) return [];
  const ids = base.map((p) => p.id);

  const [versions, drafts, scores, counts, follow] = await Promise.all([
    db.select().from(proposalVersions).where(inArray(proposalVersions.proposalId, ids)),
    db.select().from(proposalDrafts).where(inArray(proposalDrafts.proposalId, ids)),
    db.select().from(proposalStreams).where(inArray(proposalStreams.proposalId, ids)),
    db.select({ proposalId: comments.proposalId, n: sql<number>`count(*)::int` }).from(comments).where(inArray(comments.proposalId, ids)).groupBy(comments.proposalId),
    db.select({ proposalId: follows.proposalId }).from(follows).where(eq(follows.userId, user.id)),
  ]);

  const out: ProposalSummary[] = [];
  for (const p of base) {
    const mine = p.authorId === user.id;
    const vs = versions.filter((v) => v.proposalId === p.id).sort((a, b) => a.number - b.number);
    const latest = vs.at(-1) ?? null;
    if (!latest && !mine) continue;
    const d = mine ? drafts.find((x) => x.proposalId === p.id) : undefined;
    out.push({
      id: p.id,
      author: { id: p.authorId, name: p.name, initials: p.initials },
      updatedAt: p.updatedAt,
      latest: latest && { number: latest.number, title: latest.title, summary: latest.summary, body: latest.body, note: latest.note, publishedAt: latest.publishedAt },
      draft: d ? { title: d.title, summary: d.summary, body: d.body, savedAt: d.savedAt } : null,
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
  replies: CommentNode[];
};

export type ProposalDetail = {
  id: string;
  author: Person;
  versions: VersionRow[];
  draft: DraftRow | null;
  scores: ScoreRow[];
  following: boolean;
  comments: CommentNode[];
};

/** Returns null when the proposal doesn't exist or is someone else's unpublished draft. */
export async function getProposalDetail(id: string, user: CurrentUser): Promise<ProposalDetail | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [p] = await db
    .select({ id: proposals.id, authorId: proposals.authorId, name: users.name, initials: users.initials })
    .from(proposals)
    .innerJoin(users, eq(users.id, proposals.authorId))
    .where(eq(proposals.id, id))
    .limit(1);
  if (!p) return null;
  const mine = p.authorId === user.id;

  const [versions, draftRows, scores, followRows, cmts] = await Promise.all([
    db.select().from(proposalVersions).where(eq(proposalVersions.proposalId, id)).orderBy(asc(proposalVersions.number)),
    mine ? db.select().from(proposalDrafts).where(eq(proposalDrafts.proposalId, id)) : Promise.resolve([]),
    db.select().from(proposalStreams).where(eq(proposalStreams.proposalId, id)),
    db.select().from(follows).where(and(eq(follows.proposalId, id), eq(follows.userId, user.id))),
    db
      .select({ id: comments.id, parentId: comments.parentId, body: comments.body, createdAt: comments.createdAt, authorId: users.id, name: users.name, initials: users.initials })
      .from(comments)
      .innerJoin(users, eq(users.id, comments.authorId))
      .where(eq(comments.proposalId, id)),
  ]);
  if (versions.length === 0 && !mine) return null;

  const likeRows = cmts.length
    ? await db.select().from(commentLikes).where(inArray(commentLikes.commentId, cmts.map((c) => c.id)))
    : [];
  const node = (c: (typeof cmts)[number]): CommentNode => ({
    id: c.id,
    author: { id: c.authorId, name: c.name, initials: c.initials },
    body: c.body,
    createdAt: c.createdAt,
    likes: likeRows.filter((l) => l.commentId === c.id).length,
    liked: likeRows.some((l) => l.commentId === c.id && l.userId === user.id),
    replies: [],
  });
  // Threads and replies read oldest first, as in the design.
  const top = cmts.filter((c) => !c.parentId).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()).map(node);
  for (const t of top) {
    t.replies = cmts.filter((c) => c.parentId === t.id).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()).map(node);
  }

  const d = draftRows[0];
  return {
    id: p.id,
    author: { id: p.authorId, name: p.name, initials: p.initials },
    versions: versions.map((v) => ({ number: v.number, title: v.title, summary: v.summary, body: v.body, note: v.note, publishedAt: v.publishedAt })),
    draft: d ? { title: d.title, summary: d.summary, body: d.body, savedAt: d.savedAt } : null,
    scores: scores.map(({ streamId, score, authorScore, jevScore, jevConfidence }) => ({ streamId, score, authorScore, jevScore, jevConfidence })),
    following: followRows.length > 0,
    comments: top,
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
