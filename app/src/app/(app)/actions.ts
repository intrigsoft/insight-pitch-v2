"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { and, desc, eq, inArray, max } from "drizzle-orm";
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
import { getSettings } from "@/lib/settings";
import type { JevScore } from "@/lib/jev";
import { getStreams } from "@/lib/data";
import { bodyTexts, changesOf, contentSig, fallbackSummary, parseBody, plainBody, SUMMARY_MIN_CHARS, VIDEO_RE } from "@/lib/body";
import { aiNote, aiSummary, detectStreams, ruleNote } from "@/lib/detect";
import { checkComment } from "@/lib/comment-ai";
import { addToInsights, applyUserFlags, checkCached, latestVersion } from "@/lib/discussion";
import { detectLanguage } from "@/lib/comment-ai";
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
  /** Description of what changed, from the save dialog. */
  note: string;
  /** Whether the description was written automatically, and the content it describes (contentSig). */
  noteAuto: boolean;
  noteFor: string;
  /** Whether the summary was generated, and from which body (hashText). */
  summaryAuto: boolean;
  summaryFor: string;
};

/** Replaces the proposal's streams with the detected ones. Jev acts as the reviewer, so its score is the score. */
async function writeScores(proposalId: string, detected: Record<string, JevScore>) {
  await db.delete(proposalStreams).where(eq(proposalStreams.proposalId, proposalId));
  const rows = Object.entries(detected).map(([streamId, j]) => ({
    proposalId,
    streamId,
    score: Math.min(10, Math.max(1, Math.round(j.raw))),
    authorScore: null,
    jevScore: j.confidence ? j.raw : null,
    jevConfidence: j.confidence || null,
  }));
  if (rows.length) await db.insert(proposalStreams).values(rows);
}

async function currentScores(proposalId: string) {
  return db.select({ streamId: proposalStreams.streamId, score: proposalStreams.score }).from(proposalStreams).where(eq(proposalStreams.proposalId, proposalId));
}

async function latestContent(proposalId: string) {
  const [v] = await db
    .select({ number: proposalVersions.number, title: proposalVersions.title, summary: proposalVersions.summary, body: proposalVersions.body })
    .from(proposalVersions)
    .where(eq(proposalVersions.proposalId, proposalId))
    .orderBy(desc(proposalVersions.number))
    .limit(1);
  return v ?? null;
}

const sameStreams = (a: string[], b: string[]) => [...a].sort().join() === [...b].sort().join();

export async function saveDraft(input: EditorInput): Promise<Result<{ id: string; streamsChanged: boolean }>> {
  const user = await requireUser();
  const title = input.title.trim();
  const summary = input.summary.trim();
  if (!title) return { ok: false, error: (await tr())("ed.errTitle") };
  const now = new Date();

  let id = input.id;
  const before = id ? (await currentScores(id)).map((s) => s.streamId) : [];
  if (id) {
    if (!(await loadOwnProposal(id, user))) return { ok: false, error: (await tr())("ed.errOwn") };
    await db.update(proposals).set({ updatedAt: now }).where(eq(proposals.id, id));
  } else {
    [{ id }] = await db.insert(proposals).values({ authorId: user.id, createdAt: now, updatedAt: now }).returning({ id: proposals.id });
  }
  const draft = { title, summary, body: input.body, note: input.note.trim(), noteAuto: input.noteAuto, noteFor: input.noteFor, summaryAuto: input.summaryAuto, summaryFor: input.summaryFor, savedAt: now };
  await db.insert(proposalDrafts).values({ proposalId: id!, ...draft }).onConflictDoUpdate({ target: proposalDrafts.proposalId, set: draft });
  // Work out which streams the proposal affects from what it now says.
  const detected = await detectStreams({ title, summary, body: input.body }, await getStreams());
  await writeScores(id!, detected.scores);
  revalidatePath("/", "layout");
  return { ok: true, id: id!, streamsChanged: !sameStreams(before, Object.keys(detected.scores)) };
}

/** Writes the summary line from the proposal body. */
export async function writeSummary(input: { title: string; body: string }): Promise<{ summary: string }> {
  await requireUser();
  if (plainBody(input.body).trim().length < SUMMARY_MIN_CHARS) return { summary: "" };
  return { summary: (await aiSummary(input.title, input.body)) ?? fallbackSummary(input.title, input.body) };
}

export type ChangeSummary = { note: string };

/** Writes a one-line description of what changed since the last published version. */
export async function describeChanges(input: Pick<EditorInput, "id" | "title" | "summary" | "body">): Promise<ChangeSummary> {
  const user = await requireUser();
  const { t, tn } = await getI18n();
  if (!input.id || !(await loadOwnProposal(input.id, user))) return { note: "" };
  const prev = await latestContent(input.id);
  if (!prev) return { note: "" };
  const cur = { title: input.title.trim(), summary: input.summary.trim(), body: input.body };
  const changes = changesOf(prev, cur);
  if (!changes.length) return { note: "" };
  const note = (await aiNote(prev, cur, changes.map((c) => ruleNote([c], t, tn)))) ?? ruleNote(changes, t, tn);
  return { note };
}

export async function publish(input: EditorInput): Promise<Result<{ id: string; version: number; translating: number }>> {
  const user = await requireUser();
  const { t, tn } = await getI18n();
  const title = input.title.trim();
  const summary = input.summary.trim();
  const body = input.body.trim();
  if (!title || !summary || !body) return { ok: false, error: t("ed.errRequired") };
  const blocks = parseBody(body);
  if (blocks.some((b) => b.type === "image" && !b.alt.trim())) return { ok: false, error: t("ed.errAlt") };
  if (blocks.some((b) => b.type === "video" && !VIDEO_RE.test(b.url.trim()))) return { ok: false, error: t("ed.errVideo") };
  const settings = await getSettings();

  let id = input.id;
  let next = 1;
  let prev: { number: number; title: string; summary: string; body: string } | null = null;
  if (id) {
    if (!(await loadOwnProposal(id, user))) return { ok: false, error: t("ed.errOwn") };
    prev = await latestContent(id);
    next = (prev?.number ?? 0) + 1;
  }
  const cur = { title, summary, body };
  const changes = prev ? changesOf(prev, cur) : [];
  if (prev && !changes.length) return { ok: false, error: t("ed.errNothingChanged", { version: `v${prev.number}` }) };

  // Streams: reuse the ones detected when this exact content was saved, otherwise detect them now.
  const [draft] = id ? await db.select().from(proposalDrafts).where(eq(proposalDrafts.proposalId, id)).limit(1) : [];
  const saved = draft && draft.title === title && draft.summary === summary && draft.body.trim() === body ? await currentScores(id!) : null;
  const detected = saved?.length ? null : await detectStreams(cur, await getStreams());
  const streamCount = saved?.length || Object.keys(detected?.scores ?? {}).length;
  if (settings.requireStream && !streamCount) return { ok: false, error: t("ed.errStream") };

  // The description from the save dialog, unless it was written automatically for different content.
  let note = input.note.trim();
  if (prev && note && input.noteAuto && input.noteFor !== contentSig(cur)) note = "";
  if (prev && !note) note = (await aiNote(prev, cur, changes.map((c) => ruleNote([c], t, tn)))) ?? ruleNote(changes, t, tn);
  if (!note) note = t("ed.initialVersion");

  const language = await detectLanguage(`${title}\n${summary}\n${plainBody(body)}`, settings.defaultLanguage);
  const now = new Date();
  await db.transaction(async (tx) => {
    if (!id) {
      [{ id }] = await tx.insert(proposals).values({ authorId: user.id, createdAt: now, updatedAt: now }).returning({ id: proposals.id });
    } else {
      await tx.update(proposals).set({ updatedAt: now }).where(eq(proposals.id, id));
    }
    await tx.insert(proposalVersions).values({ proposalId: id!, number: next, title, summary, body, note, language, publishedAt: now });
    await tx.delete(proposalDrafts).where(eq(proposalDrafts.proposalId, id!));
  });
  if (detected) await writeScores(id!, detected.scores);
  // Translate the new version into every other enabled language after responding, so readers rarely wait.
  // Unchanged paragraphs are already cached from earlier versions and cost nothing.
  const targets = settings.txOnPublish ? (await getLanguages()).filter((l) => l.enabled && l.code !== language).map((l) => l.code) : [];
  if (targets.length) {
    const texts = [title, summary, note, ...bodyTexts(body)].filter(Boolean);
    after(async () => {
      for (const lang of targets) await translateMissing(lang, texts);
    });
  }
  after(() => refreshStrengthsSoon(user.id));
  revalidatePath("/", "layout");
  return { ok: true, id: id!, version: next, translating: targets.length };
}
