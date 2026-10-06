"use server";

import { refreshStrengthsSoon } from "@/lib/strengths";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { eq, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { comments, insightSources, proposalStreams, settings, streamLinks, streams } from "@/db/schema";
import { addToInsights } from "@/lib/discussion";
import { languages, translations } from "@/db/schema";
import { catalogEntry } from "@/lib/languages";
import { getSettings, MANDATE_PCT, MANDATE_VOTES, validMandate } from "@/lib/settings";
import { getI18n } from "@/i18n/server";

const tr = async () => (await getI18n()).t;
import { STREAM_COLORS } from "@/db/seed-data";
import { isAdmin, requireUser } from "@/lib/auth";

type Result = { ok: true } | { ok: false; error: string };

async function requireAdmin() {
  const user = await requireUser();
  if (!isAdmin(user)) throw new Error((await tr())("set.errAdmin"));
  return user;
}

const pair = (a: string, b: string) => (a < b ? { a, b } : { a: b, b: a });

export type StreamInput = { id: string | null; name: string; description: string; color: string; active: boolean; related: string[] };

export async function saveStream(input: StreamInput): Promise<Result & { id?: string }> {
  await requireAdmin();
  const name = input.name.trim();
  if (!name) return { ok: false, error: (await tr())("set.errStreamName") };
  if (name.length > 60) return { ok: false, error: (await tr())("set.errStreamNameLong") };
  const color = STREAM_COLORS.includes(input.color) ? input.color : STREAM_COLORS[0];
  const all = await db.select({ id: streams.id, name: streams.name, position: streams.position }).from(streams);
  if (all.some((s) => s.id !== input.id && s.name.toLowerCase() === name.toLowerCase())) return { ok: false, error: (await tr())("set.errStreamExists") };

  let id = input.id;
  if (id) {
    if (!all.some((s) => s.id === id)) return { ok: false, error: (await tr())("set.errStreamGone") };
    await db.update(streams).set({ name, description: input.description.trim(), color, active: input.active }).where(eq(streams.id, id));
  } else {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "stream";
    id = all.some((s) => s.id === slug) ? `${slug}-${Date.now().toString(36)}` : slug;
    const position = Math.max(-1, ...all.map((s) => s.position)) + 1;
    await db.insert(streams).values({ id, name, description: input.description.trim(), color, active: input.active, position });
  }
  // Overlap links are symmetric: replace this stream's links with the chosen set.
  const related = [...new Set(input.related)].filter((r) => r !== id && all.some((s) => s.id === r));
  await db.delete(streamLinks).where(or(eq(streamLinks.a, id!), eq(streamLinks.b, id!)));
  if (related.length) await db.insert(streamLinks).values(related.map((r) => pair(id!, r)));
  revalidatePath("/", "layout");
  return { ok: true, id: id! };
}

export async function deleteStream(id: string): Promise<Result> {
  await requireAdmin();
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(proposalStreams).where(eq(proposalStreams.streamId, id));
  if ((r?.n ?? 0) > 0) return { ok: false, error: (await tr())("set.errStreamInUse") };
  await db.delete(streams).where(eq(streams.id, id));
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function setStreamActive(id: string, active: boolean): Promise<Result> {
  await requireAdmin();
  await db.update(streams).set({ active }).where(eq(streams.id, id));
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function linkStreams(a: string, b: string): Promise<Result> {
  await requireAdmin();
  if (a === b) return { ok: false, error: (await tr())("set.errTwoStreams") };
  await db.insert(streamLinks).values(pair(a, b)).onConflictDoNothing();
  revalidatePath("/", "layout");
  return { ok: true };
}

const VALID: Record<string, (v: unknown) => boolean> = {
  scale: (v) => v === "5" || v === "10" || v === "100",
  scoredBy: (v) => v === "author" || v === "reviewers" || v === "both",
  requireStream: (v) => typeof v === "boolean",
  showPublic: (v) => typeof v === "boolean",
  txOnPublish: (v) => typeof v === "boolean",
  txComments: (v) => typeof v === "boolean",
  txLabel: (v) => typeof v === "boolean",
  mandatePct: (v) => validMandate(v, MANDATE_PCT),
  mandateVotes: (v) => validMandate(v, MANDATE_VOTES),
};

export async function updateSetting(key: string, value: string | boolean | number): Promise<Result> {
  await requireAdmin();
  if (!VALID[key]?.(value)) return { ok: false, error: (await tr())("set.errSetting") };
  await db.insert(settings).values({ key, value }).onConflictDoUpdate({ target: settings.key, set: { value } });
  revalidatePath("/", "layout");
  return { ok: true };
}

/* Moderation */

/** Publishes a held or hidden comment. Reader flags stop counting once a moderator has reviewed it. */
export async function approveComment(id: string): Promise<Result> {
  const admin = await requireAdmin();
  const [c] = await db.select().from(comments).where(eq(comments.id, id)).limit(1);
  if (!c || c.status === "removed") return { ok: false, error: (await tr())("err.commentGone") };
  await db.update(comments).set({ status: "visible", reviewedBy: admin.id, reviewedAt: new Date() }).where(eq(comments.id, id));
  after(() => addToInsights(id).catch((e) => console.warn("[insights]", e)));
  after(() => refreshStrengthsSoon(c.authorId));
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Takes a comment down. Insights it raised lose it as a source, and insights left with no source are removed. */
export async function removeComment(id: string): Promise<Result> {
  const admin = await requireAdmin();
  const [c] = await db.select().from(comments).where(eq(comments.id, id)).limit(1);
  if (!c) return { ok: false, error: (await tr())("err.commentGone") };
  await db.update(comments).set({ status: "removed", reviewedBy: admin.id, reviewedAt: new Date() }).where(eq(comments.id, id));
  await db.delete(insightSources).where(eq(insightSources.commentId, id));
  await db.execute(sql`delete from insights i where i.proposal_id = ${c.proposalId} and not exists (select 1 from insight_sources s where s.insight_id = i.id)`);
  after(() => refreshStrengthsSoon(c.authorId));
  revalidatePath("/", "layout");
  return { ok: true };
}

/* Languages */

export async function addLanguage(code: string): Promise<Result> {
  await requireAdmin();
  const entry = catalogEntry(code);
  if (!entry) return { ok: false, error: (await tr())("set.errSetting") };
  const existing = await db.select({ code: languages.code, position: languages.position }).from(languages);
  if (existing.some((l) => l.code === code)) return { ok: true };
  const position = Math.max(-1, ...existing.map((l) => l.position)) + 1;
  await db.insert(languages).values({ code, name: entry.name, native: entry.native, rtl: Boolean(entry.rtl), enabled: true, position });
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Turning a language off keeps its cached translations; readers using it fall back to the default language. */
export async function setLanguageEnabled(code: string, enabled: boolean): Promise<Result> {
  await requireAdmin();
  const { defaultLanguage } = await getSettings();
  if (code === defaultLanguage && !enabled) return { ok: false, error: (await tr())("lang.errDefault") };
  await db.update(languages).set({ enabled }).where(eq(languages.code, code));
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function removeLanguage(code: string): Promise<Result> {
  await requireAdmin();
  const { defaultLanguage } = await getSettings();
  if (code === defaultLanguage) return { ok: false, error: (await tr())("lang.errDefault") };
  await db.delete(languages).where(eq(languages.code, code));
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function setDefaultLanguage(code: string): Promise<Result> {
  await requireAdmin();
  const [l] = await db.select().from(languages).where(eq(languages.code, code)).limit(1);
  if (!l || !l.enabled) return { ok: false, error: (await tr())("set.errSetting") };
  await db.insert(settings).values({ key: "defaultLanguage", value: code }).onConflictDoUpdate({ target: settings.key, set: { value: code } });
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function setGlossary(terms: string[]): Promise<Result> {
  await requireAdmin();
  const seen = new Set<string>();
  const clean = terms.map((x) => String(x).trim()).filter((x) => x && x.length <= 80 && !seen.has(x.toLowerCase()) && seen.add(x.toLowerCase()));
  if (clean.length > 200) return { ok: false, error: (await tr())("set.errSetting") };
  await db.insert(settings).values({ key: "glossary", value: clean }).onConflictDoUpdate({ target: settings.key, set: { value: clean } });
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Empties the translation cache; everything is translated again on next read. */
export async function clearTranslationCache(): Promise<Result> {
  await requireAdmin();
  await db.delete(translations);
  revalidatePath("/", "layout");
  return { ok: true };
}
