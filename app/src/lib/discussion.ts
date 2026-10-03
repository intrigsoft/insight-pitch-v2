import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { commentFlags, comments, insightSources, insights, proposalVersions } from "@/db/schema";
import { checkComment, insightKindFor, insightText, matchInsight, type CommentCheck } from "./comment-ai";

// Two different readers flagging a comment hides it until a moderator reviews it.
export const USER_FLAGS_TO_HIDE = 2;

export async function latestVersion(proposalId: string) {
  const [v] = await db.select().from(proposalVersions).where(eq(proposalVersions.proposalId, proposalId)).orderBy(desc(proposalVersions.number)).limit(1);
  return v ?? null;
}

// The writer usually posts right after seeing the warning, so keep each check for a few minutes
// instead of asking Jev again for the same text.
const checks = new Map<string, { at: number; check: CommentCheck | null }>();
const CHECK_TTL_MS = 10 * 60_000;
// Bump when the check's rules change so earlier results aren't reused.
const CHECK_VERSION = 3;

export async function checkCached(key: string, run: () => Promise<CommentCheck | null>) {
  key = `v${CHECK_VERSION}:${key}`;
  const hit = checks.get(key);
  if (hit && Date.now() - hit.at < CHECK_TTL_MS) return hit.check;
  const check = await run();
  checks.set(key, { at: Date.now(), check });
  if (checks.size > 500) for (const [k, v] of checks) if (Date.now() - v.at > CHECK_TTL_MS) checks.delete(k);
  return check;
}

/** Fills in Jev's reading of a comment that was posted without one (Jev was down, or seeded data). */
export async function analyseComment(commentId: string) {
  const [c] = await db.select().from(comments).where(eq(comments.id, commentId)).limit(1);
  if (!c || c.kind) return c ?? null;
  const v = await latestVersion(c.proposalId);
  if (!v) return c;
  const parent = c.parentId ? (await db.select({ body: comments.body }).from(comments).where(eq(comments.id, c.parentId)).limit(1))[0] : undefined;
  const check = await checkComment(v, c.body, parent?.body);
  if (!check) return c;
  const [updated] = await db.update(comments).set({ kind: check.kind, relevance: check.relevance }).where(eq(comments.id, commentId)).returning();
  return updated;
}

/**
 * Adds a visible comment to the proposal's insights: joins an existing insight when Jev says it makes the same point,
 * otherwise starts a new one with a one-line summary. Questions, concerns and suggestions only.
 */
export async function addToInsights(commentId: string) {
  const c = await analyseComment(commentId);
  if (!c || c.status !== "visible") return;
  const kind = insightKindFor(c.kind);
  if (!kind) return;
  const [already] = await db.select().from(insightSources).where(eq(insightSources.commentId, commentId)).limit(1);
  if (already) return;
  const existing = await db.select({ id: insights.id, text: insights.text }).from(insights).where(and(eq(insights.proposalId, c.proposalId), eq(insights.kind, kind)));
  const match = await matchInsight(c.body, existing);
  if (match) {
    await db.insert(insightSources).values({ insightId: match, commentId }).onConflictDoNothing();
    return;
  }
  const v = await latestVersion(c.proposalId);
  const text = await insightText(kind, c.body, v?.title ?? "");
  const [ins] = await db.insert(insights).values({ proposalId: c.proposalId, kind, text }).returning({ id: insights.id });
  await db.insert(insightSources).values({ insightId: ins.id, commentId });
}

/** Hides a comment once enough readers flag it, and un-hides it if they withdraw their flags before review. */
export async function applyUserFlags(commentId: string) {
  const [c] = await db.select().from(comments).where(eq(comments.id, commentId)).limit(1);
  if (!c) return;
  const flags = await db
    .select({ reason: commentFlags.reason, n: sql<number>`count(*)::int` })
    .from(commentFlags)
    .where(eq(commentFlags.commentId, commentId))
    .groupBy(commentFlags.reason)
    .orderBy(desc(sql`count(*)`));
  const total = flags.reduce((a, f) => a + f.n, 0);
  if (c.status === "visible" && !c.reviewedAt && total >= USER_FLAGS_TO_HIDE) {
    await db.update(comments).set({ status: "flagged", flagSource: "users", flagReason: flags[0].reason }).where(eq(comments.id, commentId));
  } else if (c.status === "flagged" && c.flagSource === "users" && total < USER_FLAGS_TO_HIDE) {
    await db.update(comments).set({ status: "visible", flagSource: null, flagReason: null }).where(eq(comments.id, commentId));
  }
}
