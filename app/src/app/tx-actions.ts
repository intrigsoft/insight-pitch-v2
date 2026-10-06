"use server";

import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { proposals, translations } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { getLanguages, getI18n } from "@/i18n/server";
import { cachedTranslations, textHash, translateMissing } from "@/lib/translate";

const MAX_TEXTS = 300;
const MAX_CHARS = 8000;

async function checkRequest(lang: string, texts: string[]) {
  const user = await getCurrentUser();
  if (!user) return false;
  const langs = await getLanguages();
  if (!langs.some((l) => l.code === lang && l.enabled)) return false;
  return texts.length <= MAX_TEXTS && texts.every((t) => typeof t === "string" && t.length <= MAX_CHARS);
}

/** Makes sure these texts are translated into `lang` and cached. Pages refresh afterwards to pick them up. */
export async function ensureTranslations(lang: string, texts: string[]): Promise<{ ok: boolean }> {
  if (!(await checkRequest(lang, texts))) return { ok: false };
  return { ok: await translateMissing(lang, texts) };
}

export type TextTranslation = { text: string; fidelity: number | null };

/** Translates texts into `lang` (cached) and returns them with their AI accuracy check, for the discussion. */
export async function translateTexts(lang: string, texts: string[]): Promise<{ ok: boolean; result: Record<string, TextTranslation> }> {
  if (!(await checkRequest(lang, texts))) return { ok: false, result: {} };
  const ok = await translateMissing(lang, texts);
  const cached = await cachedTranslations(lang, texts);
  return { ok, result: Object.fromEntries([...cached].map(([src, c]) => [src, { text: c.text, fidelity: c.fidelity }])) };
}

/** Marks a proposal's translated sections as reviewed. Admins, officials and the proposal's author can do this. */
export async function markTranslationsReviewed(proposalId: string, lang: string, texts: string[]): Promise<{ ok: boolean; error?: string }> {
  const user = await getCurrentUser();
  const { t } = await getI18n();
  if (!user) return { ok: false, error: t("err.cantReview") };
  const [p] = await db.select({ leadId: proposals.leadId }).from(proposals).where(eq(proposals.id, proposalId)).limit(1);
  if (!p || (user.role === "citizen" && p.leadId !== user.id)) return { ok: false, error: t("err.cantReview") };
  if (!texts.length || texts.length > MAX_TEXTS) return { ok: false, error: t("err.generic") };
  await db
    .update(translations)
    .set({ reviewedBy: user.id, reviewedAt: new Date() })
    .where(and(eq(translations.lang, lang), inArray(translations.hash, texts.map(textHash))));
  return { ok: true };
}
