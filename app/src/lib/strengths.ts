import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { commentLikes, comments, follows, insightVotes, insights, proposalStreams, proposalVersions, proposals, userStrengths } from "@/db/schema";
import { getStreams, type Stream } from "./data";
import { systemOne, type ScoreAnswer } from "./jev";

// Jev reads what a person has done on Insight Pitch and scores how much it shows about each stream: the proposals they
// published, their comments (with the proposal each one is on and how many people liked it), and lighter signals:
// proposals they follow and insights they upvoted. One call, one Score question per active stream.

// Jev allows ten levels: 0 is "nothing", 9 is "defining area". Results are scaled to 0–10.
const LEVELS = [
  "0: Nothing in the activity relates to this stream.",
  "1: Only weak signals, such as following a proposal or upvoting an insight in this stream.",
  "2: A brief comment that touches this stream, or several weak signals.",
  "3: Has commented on proposals in this stream a few times.",
  "4: Several comments in this stream, or one showing real knowledge of it.",
  "5: Consistent, informed comments in this stream, or a proposal where it is a secondary concern.",
  "6: A proposal in which this stream plays a major part, or many informed comments about it.",
  "7: Has written a proposal centred on this stream.",
  "8: Proposals centred on this stream plus informed discussion of it; clearly one of their main areas.",
  "9: Sustained, expert work in this stream across proposals and discussion; their defining area.",
];
const TOP = LEVELS.length - 1;

const INSTRUCTIONS = (s: Stream) =>
  `How much interest and knowledge in the "${s.name}" stream (${s.description || s.name}) does this person's activity show? ` +
  "Writing proposals is the strongest signal, then comments that show knowledge; following proposals and upvoting insights are weak signals. " +
  "Judge only what the activity shows, in whatever language it is written.";

const MAX_PROPOSALS = 12;
const MAX_COMMENTS = 40;
const MAX_COMMENT_CHARS = 400;
const MAX_FOLLOWS = 20;
const MAX_UPVOTES = 20;
// Streams Jev scores below this aren't shown.
export const STRENGTH_MIN = 1;

export type Activity = {
  proposals_written: { title: string; summary: string; streams: string[] }[];
  comments: { on_proposal: string; text: string; likes: number }[];
  following: string[];
  upvoted_insights: string[];
};

export async function activityOf(userId: string, streams: Stream[]): Promise<Activity> {
  const [versions, mine, followed, votes] = await Promise.all([
    db.select({ proposalId: proposalVersions.proposalId, number: proposalVersions.number, title: proposalVersions.title, summary: proposalVersions.summary, authorId: proposals.authorId })
      .from(proposalVersions).innerJoin(proposals, eq(proposals.id, proposalVersions.proposalId)),
    db.select({ id: comments.id, proposalId: comments.proposalId, body: comments.body, createdAt: comments.createdAt })
      .from(comments).where(and(eq(comments.authorId, userId), eq(comments.status, "visible"))),
    db.select({ proposalId: follows.proposalId }).from(follows).where(eq(follows.userId, userId)),
    db.select({ text: insights.text }).from(insightVotes).innerJoin(insights, eq(insights.id, insightVotes.insightId)).where(eq(insightVotes.userId, userId)),
  ]);
  const latest = new Map<string, (typeof versions)[number]>();
  for (const v of versions) if (!latest.has(v.proposalId) || latest.get(v.proposalId)!.number < v.number) latest.set(v.proposalId, v);
  const ownIds = [...latest.values()].filter((v) => v.authorId === userId).map((v) => v.proposalId).slice(0, MAX_PROPOSALS);
  const commentIds = mine.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, MAX_COMMENTS);
  const [scores, likes] = await Promise.all([
    ownIds.length ? db.select().from(proposalStreams).where(inArray(proposalStreams.proposalId, ownIds)) : Promise.resolve([]),
    commentIds.length ? db.select({ commentId: commentLikes.commentId }).from(commentLikes).where(inArray(commentLikes.commentId, commentIds.map((c) => c.id))) : Promise.resolve([]),
  ]);
  const name = (id: string) => streams.find((s) => s.id === id)?.name;
  return {
    proposals_written: ownIds.map((id) => {
      const v = latest.get(id)!;
      // Streams the proposal was classified into, strongest first, as context.
      const st = scores.filter((s) => s.proposalId === id && s.score >= 5).sort((a, b) => b.score - a.score).flatMap((s) => name(s.streamId) ?? []);
      return { title: v.title, summary: v.summary, streams: st };
    }),
    comments: commentIds.flatMap((c) => {
      const v = latest.get(c.proposalId);
      if (!v) return [];
      return [{ on_proposal: v.title, text: c.body.slice(0, MAX_COMMENT_CHARS), likes: likes.filter((l) => l.commentId === c.id).length }];
    }),
    following: followed.flatMap((f) => latest.get(f.proposalId)?.title ?? []).slice(0, MAX_FOLLOWS),
    upvoted_insights: votes.map((v) => v.text).slice(0, MAX_UPVOTES),
  };
}

export const isEmpty = (a: Activity) => !a.proposals_written.length && !a.comments.length && !a.following.length && !a.upvoted_insights.length;

/** Jev's 0–10 reading per stream (probability-weighted, so 6.4 is between levels 6 and 7). Null if Jev is unavailable. */
export async function jevStrengths(activity: Activity, streams: Stream[]): Promise<Record<string, { score: number; confidence: number }> | null> {
  const active = streams.filter((s) => s.active);
  if (!active.length) return {};
  const questions = Object.fromEntries(active.map((s, i) => [`s${i}`, { type: "score" as const, instructions: INSTRUCTIONS(s), criteria: LEVELS }]));
  const r = await systemOne({ activity }, questions);
  if (!r) return null;
  const out: Record<string, { score: number; confidence: number }> = {};
  active.forEach((s, i) => {
    const a = r.answers[`s${i}`] as ScoreAnswer | undefined;
    if (a?.type !== "score") return;
    const expected = Object.entries(a.probabilities ?? {}).reduce((sum, [k, p]) => sum + Number(k) * p, 0);
    const level = a.probabilities && Number.isFinite(expected) ? expected : a.score;
    out[s.id] = { score: (level / TOP) * 10, confidence: a.confidence };
  });
  return out;
}

/** Recalculates and stores a person's strengths. Leaves the old ones in place if Jev is unavailable. */
export async function refreshStrengths(userId: string) {
  const streams = await getStreams();
  const activity = await activityOf(userId, streams);
  if (isEmpty(activity)) {
    await db.delete(userStrengths).where(eq(userStrengths.userId, userId));
    return { ok: true as const, scores: {} };
  }
  const scores = await jevStrengths(activity, streams);
  if (!scores) return { ok: false as const };
  const computedAt = new Date();
  await db.transaction(async (tx) => {
    await tx.delete(userStrengths).where(eq(userStrengths.userId, userId));
    const rows = Object.entries(scores).map(([streamId, s]) => ({ userId, streamId, score: s.score, confidence: s.confidence, computedAt }));
    if (rows.length) await tx.insert(userStrengths).values(rows);
  });
  return { ok: true as const, scores };
}

// One refresh per person at a time: activity that arrives while Jev is working triggers one more run afterwards.
const running = new Map<string, boolean>();

/** Recalculates a person's strengths in the background. Call it from `after()`. */
export async function refreshStrengthsSoon(userId: string) {
  if (running.has(userId)) {
    running.set(userId, true);
    return;
  }
  running.set(userId, false);
  try {
    do {
      running.set(userId, false);
      const r = await refreshStrengths(userId).catch((e) => (console.warn("[strengths]", e), { ok: false }));
      if (!r.ok) break;
    } while (running.get(userId));
  } finally {
    running.delete(userId);
  }
}
