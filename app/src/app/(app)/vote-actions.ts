"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { proposals, proposalVersions, proposalVotes } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { REASON_MAX, VOTE_MIN_OPTIONS, type Stance } from "@/lib/votes";
import { getI18n } from "@/i18n/server";

type Result = { ok: true; message?: string } | { ok: false; error: string };

const done = (message?: string): Result => {
  revalidatePath("/", "layout");
  return { ok: true, message };
};

/** Supports or opposes a published proposal, or withdraws the vote (null). */
export async function castVote(proposalId: string, stance: Stance | null): Promise<Result> {
  const user = await requireUser();
  const { t } = await getI18n();
  const [v] = await db.select({ n: proposalVersions.number }).from(proposalVersions).where(eq(proposalVersions.proposalId, proposalId)).limit(1);
  if (!v) return { ok: false, error: t("md.errNotPublished") };
  const where = and(eq(proposalVotes.proposalId, proposalId), eq(proposalVotes.userId, user.id));
  if (!stance) {
    await db.delete(proposalVotes).where(where);
    return done(t("md.withdrawn"));
  }
  const [cur] = await db.select({ stance: proposalVotes.stance }).from(proposalVotes).where(where).limit(1);
  if (cur?.stance === stance) return { ok: true };
  // A reason for opposing no longer applies once the person supports the proposal.
  const reset = stance === "support" ? { reason: "", reasonAt: null } : {};
  await db
    .insert(proposalVotes)
    .values({ proposalId, userId: user.id, stance })
    .onConflictDoUpdate({ target: [proposalVotes.proposalId, proposalVotes.userId], set: { stance, updatedAt: new Date(), ...reset } });
  return done(t("md.recorded"));
}

/** Tells the lead what would need to change for someone who opposes the proposal to support it. */
export async function sendVoteReason(proposalId: string, text: string): Promise<Result> {
  const user = await requireUser();
  const { t } = await getI18n();
  const reason = text.trim().slice(0, REASON_MAX);
  if (!reason) return { ok: false, error: t("md.errReason") };
  const rows = await db
    .update(proposalVotes)
    .set({ reason, reasonAt: new Date() })
    .where(and(eq(proposalVotes.proposalId, proposalId), eq(proposalVotes.userId, user.id), eq(proposalVotes.stance, "oppose")))
    .returning({ id: proposalVotes.userId });
  if (!rows.length) return { ok: false, error: t("md.errNotOpposed") };
  return done(t("md.reasonSent"));
}

/** The lead's setting for how many votes a proposal needs before its share of support is shown. */
export async function setVoteMin(proposalId: string, n: number): Promise<Result> {
  const user = await requireUser();
  const { t } = await getI18n();
  if (!(VOTE_MIN_OPTIONS as readonly number[]).includes(n)) return { ok: false, error: t("set.errSetting") };
  const rows = await db.update(proposals).set({ voteMin: n }).where(and(eq(proposals.id, proposalId), eq(proposals.leadId, user.id))).returning({ id: proposals.id });
  if (!rows.length) return { ok: false, error: t("tm.errNotLead") };
  return done(t("md.minSet", { n }));
}
