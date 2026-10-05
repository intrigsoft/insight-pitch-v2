"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { and, eq, inArray, max } from "drizzle-orm";
import { db } from "@/db";
import {
  commentFlags,
  commentLikes,
  comments,
  insightVotes,
  insights,
  follows,
  proposalDrafts,
  proposalStreams,
  proposalVersions,
  proposals,
  streams,
} from "@/db/schema";
import { requireUser, type CurrentUser } from "@/lib/auth";
import { getSettings, type AppSettings } from "@/lib/settings";
import { scoreWithJev } from "@/lib/jev";
import { checkComment } from "@/lib/comment-ai";
import { addToInsights, applyUserFlags, checkCached, latestVersion } from "@/lib/discussion";
import { detectLanguage } from "@/lib/comment-ai";
import { bodyUnits } from "@/lib/content-tx";
import { translateMissing } from "@/lib/translate";
import { refreshStrengthsSoon } from "@/lib/strengths";
import { getI18n, getLanguages } from "@/i18n/server";

const tr = async () => (await getI18n()).t;

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

async function loadOwnProposal(id: string, user: CurrentUser) {
  const [p] = await db.select().from(proposals).where(eq(proposals.id, id)).limit(1);
  if (!p) return null;
  return p.authorId === user.id ? p : null;
}

async function isPublished(id: string) {
  const [r] = await db.select({ n: max(proposalVersions.number) }).from(proposalVersions).where(eq(proposalVersions.proposalId, id));
  return (r?.n ?? 0) > 0;
}

/* Follow */

export async function toggleFollow(proposalId: string): Promise<Result<{ following: boolean }>> {
  const user = await requireUser();
  if (!(await isPublished(proposalId))) return { ok: false, error: (await tr())("err.followPublished") };
  const where = and(eq(follows.userId, user.id), eq(follows.proposalId, proposalId));
  const [existing] = await db.select().from(follows).where(where).limit(1);
  if (existing) await db.delete(follows).where(where);
  else await db.insert(follows).values({ userId: user.id, proposalId });
  after(() => refreshStrengthsSoon(user.id));
  revalidatePath("/", "layout");
  return { ok: true, following: !existing };
}

/* Discussion */

export type PostResult =
  | { ok: true; status: "visible" | "pending" }
  | { ok: false; error: string }
  | { ok: false; check: { flag: string | null; offtopic: boolean } };

/**
 * Posts a comment or reply after Jev has read it. If Jev sees a rule problem (or, for comments, that it's off-topic),
 * nothing is saved: the writer gets a warning and must send again with `confirmed` to post. Confirmed comments with a
 * rule problem are held for moderators and only their author sees them.
 */
export async function postComment(proposalId: string, body: string, parentId?: string, confirmed = false): Promise<PostResult> {
  const user = await requireUser();
  const text = body.trim();
  if (!text) return { ok: false, error: (await tr())("err.commentEmpty") };
  if (text.length > 5000) return { ok: false, error: (await tr())("err.commentLong") };
  const version = await latestVersion(proposalId);
  if (!version) return { ok: false, error: (await tr())("err.commentsClosed") };
  let parentBody: string | undefined;
  if (parentId) {
    // Replies always attach to a top-level comment on the same proposal.
    const [parent] = await db.select().from(comments).where(eq(comments.id, parentId)).limit(1);
    if (!parent || parent.proposalId !== proposalId || parent.parentId || parent.status === "removed") return { ok: false, error: (await tr())("err.commentGone") };
    parentBody = parent.body;
  }

  const check = await checkCached(`${user.id}:${proposalId}:${parentId ?? ""}:${text}`, () => checkComment(version, text, parentBody));
  const warn = Boolean(check && (check.flag || (!parentId && check.offtopic)));
  if (warn && !confirmed) return { ok: false, check: { flag: check!.flag, offtopic: check!.offtopic } };

  const status = check?.flag ? "pending" : "visible";
  const [row] = await db
    .insert(comments)
    .values({
      proposalId,
      parentId: parentId ?? null,
      authorId: user.id,
      body: text,
      status,
      flagReason: check?.flag ?? null,
      flagSource: check?.flag ? "jev" : null,
      kind: check?.kind ?? null,
      relevance: check?.relevance ?? null,
      language: check?.language ?? null,
    })
    .returning({ id: comments.id });
  if (status === "visible") {
    after(() => addToInsights(row.id).catch((e) => console.warn("[insights]", e)));
    after(() => refreshStrengthsSoon(user.id));
  }
  revalidatePath("/", "layout");
  return { ok: true, status };
}

/** Flags a comment for moderators with a reason, or withdraws the flag when `reason` is null. */
export async function flagComment(commentId: string, reason: "Off-topic" | "Inappropriate" | "Spam" | "Misleading" | null): Promise<Result> {
  const user = await requireUser();
  const [c] = await db.select().from(comments).where(eq(comments.id, commentId)).limit(1);
  if (!c || c.status === "removed") return { ok: false, error: (await tr())("err.commentGone") };
  if (c.authorId === user.id) return { ok: false, error: (await tr())("err.ownFlag") };
  const where = and(eq(commentFlags.commentId, commentId), eq(commentFlags.userId, user.id));
  if (reason === null) await db.delete(commentFlags).where(where);
  else if (!["Off-topic", "Inappropriate", "Spam", "Misleading"].includes(reason)) return { ok: false, error: (await tr())("err.pickReason") };
  else await db.insert(commentFlags).values({ commentId, userId: user.id, reason }).onConflictDoUpdate({ target: [commentFlags.commentId, commentFlags.userId], set: { reason } });
  await applyUserFlags(commentId);
  revalidatePath("/", "layout");
  return { ok: true };
}

/* Insights */

export async function voteInsight(insightId: string): Promise<Result<{ voted: boolean }>> {
  const user = await requireUser();
  const [ins] = await db.select({ id: insights.id }).from(insights).where(eq(insights.id, insightId)).limit(1);
  if (!ins) return { ok: false, error: (await tr())("err.insightGone") };
  const where = and(eq(insightVotes.insightId, insightId), eq(insightVotes.userId, user.id));
  const [existing] = await db.select().from(insightVotes).where(where).limit(1);
  if (existing) await db.delete(insightVotes).where(where);
  else await db.insert(insightVotes).values({ insightId, userId: user.id });
  after(() => refreshStrengthsSoon(user.id));
  revalidatePath("/", "layout");
  return { ok: true, voted: !existing };
}

/** Only the proposal's author can mark a clarification as answered. */
export async function markAnswered(insightId: string, answered: boolean): Promise<Result> {
  const user = await requireUser();
  const [ins] = await db
    .select({ kind: insights.kind, authorId: proposals.authorId })
    .from(insights)
    .innerJoin(proposals, eq(proposals.id, insights.proposalId))
    .where(eq(insights.id, insightId))
    .limit(1);
  if (!ins) return { ok: false, error: (await tr())("err.insightGone") };
  if (ins.authorId !== user.id) return { ok: false, error: (await tr())("err.onlyAuthorAnswers") };
  if (ins.kind !== "clarification") return { ok: false, error: (await tr())("err.onlyClarifications") };
  await db.update(insights).set({ answered }).where(eq(insights.id, insightId));
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function toggleLike(commentId: string): Promise<Result<{ liked: boolean }>> {
  const user = await requireUser();
  const where = and(eq(commentLikes.commentId, commentId), eq(commentLikes.userId, user.id));
  const [existing] = await db.select().from(commentLikes).where(where).limit(1);
  if (existing) await db.delete(commentLikes).where(where);
  else {
    const [c] = await db.select({ id: comments.id }).from(comments).where(eq(comments.id, commentId)).limit(1);
    if (!c) return { ok: false, error: (await tr())("err.commentGone") };
    await db.insert(commentLikes).values({ commentId, userId: user.id });
  }
  revalidatePath("/", "layout");
  return { ok: true, liked: !existing };
}

/* Editor */

export type EditorInput = {
  id: string | null;
  title: string;
  summary: string;
  body: string;
  note: string;
  scores: Record<string, number>; // streamId -> suggested score (1–10)
};

function cleanScores(scores: Record<string, number>) {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(scores ?? {})) {
    const n = Math.round(Number(v));
    if (k && Number.isFinite(n)) out[k] = Math.min(10, Math.max(1, n));
  }
  return out;
}

/** New streams must be active; streams already on the proposal may stay even if since deactivated. */
async function validateStreams(ids: string[], keep: string[]) {
  if (!ids.length) return null;
  const rows = await db.select({ id: streams.id, active: streams.active }).from(streams).where(inArray(streams.id, ids));
  for (const id of ids) {
    const r = rows.find((x) => x.id === id);
    if (!r || (!r.active && !keep.includes(id))) return (await tr())("ed.errStreamGone");
  }
  return null;
}

async function currentStreamIds(proposalId: string) {
  return (await db.select({ id: proposalStreams.streamId }).from(proposalStreams).where(eq(proposalStreams.proposalId, proposalId))).map((r) => r.id);
}

async function writeScores(proposalId: string, scores: Record<string, number>, settings: AppSettings, jev?: Record<string, { score: number; raw: number; confidence: number }>) {
  const existing = await db.select().from(proposalStreams).where(eq(proposalStreams.proposalId, proposalId));
  await db.delete(proposalStreams).where(eq(proposalStreams.proposalId, proposalId));
  const rows = Object.entries(scores).map(([streamId, suggested]) => {
    const prev = existing.find((e) => e.streamId === streamId);
    const j = jev?.[streamId];
    const jevScore = j ? j.raw : prev?.jevScore ?? null;
    const jevConfidence = j ? j.confidence : prev?.jevConfidence ?? null;
    const authorScore = settings.scoredBy === "reviewers" ? null : suggested;
    // Jev acts as the reviewer: its score wins unless authors score their own proposals.
    const reviewed = jevScore != null ? Math.min(10, Math.max(1, Math.round(jevScore))) : null;
    const score = settings.scoredBy === "author" ? suggested : reviewed ?? authorScore ?? 5;
    return { proposalId, streamId, score, authorScore, jevScore, jevConfidence };
  });
  if (rows.length) await db.insert(proposalStreams).values(rows);
}

export async function saveDraft(input: EditorInput): Promise<Result<{ id: string }>> {
  const user = await requireUser();
  const title = input.title.trim();
  if (!title) return { ok: false, error: (await tr())("ed.errTitle") };
  const scores = cleanScores(input.scores);
  const settings = await getSettings();
  const now = new Date();

  let id = input.id;
  if (id) {
    if (!(await loadOwnProposal(id, user))) return { ok: false, error: (await tr())("ed.errOwn") };
    const err = await validateStreams(Object.keys(scores), await currentStreamIds(id));
    if (err) return { ok: false, error: err };
    await db.update(proposals).set({ updatedAt: now }).where(eq(proposals.id, id));
  } else {
    const err = await validateStreams(Object.keys(scores), []);
    if (err) return { ok: false, error: err };
    [{ id }] = await db.insert(proposals).values({ authorId: user.id, createdAt: now, updatedAt: now }).returning({ id: proposals.id });
  }
  await db
    .insert(proposalDrafts)
    .values({ proposalId: id!, title, summary: input.summary.trim(), body: input.body, savedAt: now })
    .onConflictDoUpdate({ target: proposalDrafts.proposalId, set: { title, summary: input.summary.trim(), body: input.body, savedAt: now } });
  await writeScores(id!, scores, settings);
  revalidatePath("/", "layout");
  return { ok: true, id: id! };
}

export async function publish(input: EditorInput): Promise<Result<{ id: string; version: number; jev: "scored" | "unavailable" | "skipped"; translating: number }>> {
  const user = await requireUser();
  const title = input.title.trim();
  const summary = input.summary.trim();
  const body = input.body.trim();
  const note = input.note.trim();
  if (!title || !summary || !body) return { ok: false, error: (await tr())("ed.errRequired") };
  const settings = await getSettings();
  const scores = cleanScores(input.scores);
  if (settings.requireStream && Object.keys(scores).length === 0) return { ok: false, error: (await tr())("ed.errStream") };

  let id = input.id;
  let next = 1;
  if (id) {
    if (!(await loadOwnProposal(id, user))) return { ok: false, error: (await tr())("ed.errOwn") };
    const [r] = await db.select({ n: max(proposalVersions.number) }).from(proposalVersions).where(eq(proposalVersions.proposalId, id));
    next = (r?.n ?? 0) + 1;
    if (next > 1 && !note) return { ok: false, error: (await tr())("ed.errNote") };
  }
  const err = await validateStreams(Object.keys(scores), id ? await currentStreamIds(id) : []);
  if (err) return { ok: false, error: err };

  // Score before writing so a slow or failing Jev call never leaves a half-published proposal.
  const streamRows = Object.keys(scores).length
    ? await db.select({ id: streams.id, name: streams.name, description: streams.description }).from(streams).where(inArray(streams.id, Object.keys(scores)))
    : [];
  const [jev, language] = await Promise.all([
    settings.scoredBy === "author" || !streamRows.length ? null : scoreWithJev({ title, summary, body }, streamRows),
    detectLanguage(`${title}\n${summary}\n${body}`, settings.defaultLanguage),
  ]);
  if (jev && !jev.ok) console.warn("[jev] scoring unavailable:", jev.reason);

  const now = new Date();
  await db.transaction(async (tx) => {
    if (!id) {
      [{ id }] = await tx.insert(proposals).values({ authorId: user.id, createdAt: now, updatedAt: now }).returning({ id: proposals.id });
    } else {
      await tx.update(proposals).set({ updatedAt: now }).where(eq(proposals.id, id));
    }
    await tx.insert(proposalVersions).values({ proposalId: id!, number: next, title, summary, body, note: note || (await tr())("ed.initialVersion"), language, publishedAt: now });
    await tx.delete(proposalDrafts).where(eq(proposalDrafts.proposalId, id!));
  });
  await writeScores(id!, scores, settings, jev?.ok ? jev.scores : undefined);
  // Translate the new version into every other enabled language after responding, so readers rarely wait.
  // Unchanged paragraphs are already cached from earlier versions and cost nothing.
  const targets = settings.txOnPublish ? (await getLanguages()).filter((l) => l.enabled && l.code !== language).map((l) => l.code) : [];
  if (targets.length) {
    const texts = [title, summary, note, ...bodyUnits(body).map((u) => u.text)].filter(Boolean);
    after(async () => {
      for (const lang of targets) await translateMissing(lang, texts);
    });
  }
  after(() => refreshStrengthsSoon(user.id));
  revalidatePath("/", "layout");
  return { ok: true, id: id!, version: next, jev: jev == null ? "skipped" : jev.ok ? "scored" : "unavailable", translating: targets.length };
}
