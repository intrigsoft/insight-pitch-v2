import "server-only";
import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { proposalVotes } from "@/db/schema";

// Public support for published proposals. Anyone can support or oppose a proposal, once, and change their mind.
// The share of support shows publicly once a proposal has the lead's minimum number of votes, and a proposal has
// a mandate once enough voters support it (the admin's mandate rule).

export const VOTE_MIN_OPTIONS = [10, 20, 30, 50, 100] as const;
export const REASON_MAX = 500;

export { tally, type MandateRule, type Stance, type Tally } from "./vote-tally";
import type { Stance } from "./vote-tally";

/** Supporters and opponents of each proposal, and how the user voted. */
export async function voteCounts(proposalIds: string[], userId: string) {
  const out = new Map<string, { support: number; oppose: number; mine: Stance | null }>();
  if (!proposalIds.length) return out;
  const [rows, mine] = await Promise.all([
    db
      .select({ proposalId: proposalVotes.proposalId, stance: proposalVotes.stance, n: sql<number>`count(*)::int` })
      .from(proposalVotes)
      .where(inArray(proposalVotes.proposalId, proposalIds))
      .groupBy(proposalVotes.proposalId, proposalVotes.stance),
    db.select({ proposalId: proposalVotes.proposalId, stance: proposalVotes.stance }).from(proposalVotes).where(and(inArray(proposalVotes.proposalId, proposalIds), eq(proposalVotes.userId, userId))),
  ]);
  for (const id of proposalIds) out.set(id, { support: 0, oppose: 0, mine: null });
  for (const r of rows) out.get(r.proposalId)![r.stance] = r.n;
  for (const m of mine) out.get(m.proposalId)!.mine = m.stance;
  return out;
}

/**
 * The share of support at evenly spaced points from the first version to now, ending with the current share.
 * Early points with only a handful of votes are left out, as they swing too much to mean anything.
 */
export async function supportTrend(proposalId: string, from: Date, now = Date.now(), points = 7): Promise<number[]> {
  const rows = await db.select({ stance: proposalVotes.stance, at: proposalVotes.createdAt }).from(proposalVotes).where(eq(proposalVotes.proposalId, proposalId)).orderBy(asc(proposalVotes.createdAt));
  const out: number[] = [];
  for (let k = 1; k <= points; k++) {
    const at = from.getTime() + ((now - from.getTime()) * k) / points;
    const upTo = rows.filter((r) => r.at.getTime() <= at);
    if (upTo.length < (k === points ? 1 : 5)) continue;
    out.push(Math.round((upTo.filter((r) => r.stance === "support").length / upTo.length) * 100));
  }
  return out;
}

/** What people who still oppose the proposal said would need to change, newest first. */
export async function opposeReasons(proposalId: string) {
  return db
    .select({ text: proposalVotes.reason, at: proposalVotes.reasonAt })
    .from(proposalVotes)
    .where(and(eq(proposalVotes.proposalId, proposalId), eq(proposalVotes.stance, "oppose"), ne(proposalVotes.reason, "")))
    .then((rows) => rows.map((r) => ({ text: r.text, at: r.at ?? new Date(0) })).sort((a, b) => b.at.getTime() - a.at.getTime()));
}
