import "server-only";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { commentLikes, comments, userFollows, users } from "@/db/schema";
import type { CurrentUser } from "./auth";
import { getVisibleProposals, type ProposalSummary } from "./data";

export type ProfileUser = {
  id: string;
  name: string;
  initials: string;
  role: "admin" | "official" | "citizen";
  title: string;
  org: string;
  location: string;
  bio: string;
  reads: string[];
  strengthsPublic: boolean;
  joined: Date;
};

export type ProfileComment = {
  id: string;
  proposalId: string;
  /** Top-level comment this one replies to, if it is a reply. */
  parentId: string | null;
  parentAuthor: { id: string; name: string } | null;
  proposal: { title: string; language: string | null };
  body: string;
  createdAt: Date;
  likes: number;
  relevance: number | null;
  status: "visible" | "pending" | "flagged";
};

export type Strength = { streamId: string; level: number; raw: number; proposals: number; comments: number };

export type Profile = {
  user: ProfileUser;
  isMe: boolean;
  following: boolean;
  proposals: ProposalSummary[];
  comments: ProfileComment[];
  strengths: Strength[];
  /** Streams of the proposals the person wrote or discussed, with how many such proposals each. */
  streams: { streamId: string; count: number }[];
};

export async function getProfile(id: string, viewer: CurrentUser): Promise<Profile | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [u] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!u) return null;
  const isMe = u.id === viewer.id;
  const isModerator = viewer.role === "admin";

  const [visible, rows, follow] = await Promise.all([
    getVisibleProposals(viewer),
    db
      .select({
        id: comments.id, proposalId: comments.proposalId, parentId: comments.parentId, body: comments.body, createdAt: comments.createdAt,
        relevance: comments.relevance, status: comments.status,
      })
      .from(comments)
      .where(and(eq(comments.authorId, u.id), ne(comments.status, "removed"))),
    isMe ? Promise.resolve([]) : db.select().from(userFollows).where(and(eq(userFollows.followerId, viewer.id), eq(userFollows.followeeId, u.id))),
  ]);

  const published = new Map(visible.filter((p) => p.latest).map((p) => [p.id, p]));
  // Held comments are only shown to their author and to moderators.
  const shown = rows.filter((c) => published.has(c.proposalId) && (c.status !== "pending" || isMe || isModerator));
  const ids = shown.map((c) => c.id);
  const parentIds = [...new Set(shown.flatMap((c) => (c.parentId ? [c.parentId] : [])))];
  const [likes, parents] = await Promise.all([
    ids.length
      ? db.select({ commentId: commentLikes.commentId, n: sql<number>`count(*)::int` }).from(commentLikes).where(inArray(commentLikes.commentId, ids)).groupBy(commentLikes.commentId)
      : Promise.resolve([]),
    parentIds.length
      ? db.select({ id: comments.id, authorId: comments.authorId, name: users.name }).from(comments).innerJoin(users, eq(users.id, comments.authorId)).where(inArray(comments.id, parentIds))
      : Promise.resolve([]),
  ]);

  const profileComments: ProfileComment[] = shown
    .map((c) => {
      const p = published.get(c.proposalId)!;
      const parent = parents.find((x) => x.id === c.parentId);
      return {
        id: c.id,
        proposalId: c.proposalId,
        parentId: c.parentId,
        parentAuthor: parent ? { id: parent.authorId, name: parent.name } : null,
        proposal: { title: p.latest!.title, language: p.latest!.language },
        body: c.body,
        createdAt: c.createdAt,
        likes: likes.find((l) => l.commentId === c.id)?.n ?? 0,
        relevance: c.relevance,
        status: c.status as ProfileComment["status"],
      };
    })
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  // Others only see published proposals; the person sees their own drafts too.
  const own = visible.filter((p) => p.author.id === u.id && (isMe || p.latest)).sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

  const involved = new Set<string>([...own.filter((p) => p.latest).map((p) => p.id), ...profileComments.map((c) => c.proposalId)]);
  const streamCount = new Map<string, number>();
  for (const pid of involved) for (const s of published.get(pid)?.scores ?? []) streamCount.set(s.streamId, (streamCount.get(s.streamId) ?? 0) + 1);

  return {
    user: {
      id: u.id, name: u.name, initials: u.initials, role: u.role, title: u.title, org: u.org, location: u.location, bio: u.bio,
      reads: Array.isArray(u.reads) ? u.reads : [], strengthsPublic: u.strengthsPublic, joined: u.createdAt,
    },
    isMe,
    following: follow.length > 0,
    proposals: own,
    comments: profileComments,
    strengths: strengthsOf(u.id, [...published.values()], profileComments),
    streams: [...streamCount.entries()].map(([streamId, count]) => ({ streamId, count })).sort((a, b) => b.count - a.count),
  };
}

// Strengths per stream, from the stream scores of the proposals the person published and of the proposals they
// commented on. A comment counts for less than a proposal, weighted by how relevant it was to the proposal and how
// many people liked it. Comments held or hidden by moderation don't count. The total maps onto 1–10 with
// diminishing returns, so a handful of strong contributions already reads high but ten scores need sustained work.
export function strengthsOf(userId: string, published: ProposalSummary[], mine: ProfileComment[]): Strength[] {
  const raw = new Map<string, { raw: number; proposals: number; comments: number }>();
  const add = (streamId: string, v: number, kind: "proposals" | "comments") => {
    const e = raw.get(streamId) ?? { raw: 0, proposals: 0, comments: 0 };
    e.raw += v;
    e[kind] += 1;
    raw.set(streamId, e);
  };
  for (const p of published) {
    if (p.author.id === userId) for (const s of p.scores) add(s.streamId, s.score, "proposals");
    for (const c of mine) {
      if (c.proposalId !== p.id || c.status !== "visible") continue;
      const rel = (c.relevance ?? 50) / 100;
      for (const s of p.scores) add(s.streamId, (s.score / 10) * rel * 3 * (1 + Math.min(c.likes, 10) * 0.1), "comments");
    }
  }
  return [...raw.entries()]
    .filter(([, e]) => e.raw >= 1)
    .map(([streamId, e]) => ({ streamId, ...e, level: Math.max(1, Math.round(10 * (1 - Math.exp(-e.raw / 8)))) }))
    .sort((a, b) => b.level - a.level || b.raw - a.raw)
    .slice(0, 5);
}

/** Ids of the people a user follows. */
export async function getFollowedPeople(userId: string): Promise<Set<string>> {
  const rows = await db.select({ id: userFollows.followeeId }).from(userFollows).where(eq(userFollows.followerId, userId));
  return new Set(rows.map((r) => r.id));
}
