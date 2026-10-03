import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { after } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { languages } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { isRtl, localeFor } from "@/lib/languages";
import { cachedTranslations, translateMissing } from "@/lib/translate";
import { makeT } from "./core";
import { en, type MessageKey, type Messages } from "./en";
import { si } from "./si";
import { ta } from "./ta";

export const LANG_COOKIE = "ip_lang";

// Reviewed, committed catalogues. Other enabled languages are machine-translated and cached at runtime.
const STATIC: Record<string, Partial<Messages>> = { en, si, ta };

export type Language = { code: string; name: string; native: string; rtl: boolean; enabled: boolean };

export const getLanguages = cache(async (): Promise<Language[]> =>
  db.select({ code: languages.code, name: languages.name, native: languages.native, rtl: languages.rtl, enabled: languages.enabled }).from(languages).orderBy(asc(languages.position)),
);

/** The reader's language: their account setting, else the language cookie, else the site default. Always an enabled language. */
export const getLang = cache(async (): Promise<string> => {
  const [user, settings, langs] = await Promise.all([getCurrentUser(), getSettings(), getLanguages()]);
  const enabled = new Set(langs.filter((l) => l.enabled).map((l) => l.code));
  const cookieLang = (await cookies()).get(LANG_COOKIE)?.value;
  for (const c of [user?.language, cookieLang, settings.defaultLanguage]) if (c && enabled.has(c)) return c;
  return settings.defaultLanguage || "en";
});

async function messagesFor(lang: string): Promise<Partial<Messages>> {
  if (STATIC[lang]) return STATIC[lang];
  const keys = Object.keys(en) as MessageKey[];
  const cached = await cachedTranslations(lang, keys.map((k) => en[k]));
  // Anything not translated yet shows in English this time and is filled in for the next page view.
  if (cached.size < keys.length) after(() => translateMissing(lang, keys.map((k) => en[k]), "interface"));
  const out: Partial<Messages> = {};
  for (const k of keys) {
    const hit = cached.get(en[k]);
    if (hit) out[k] = hit.text;
  }
  return out;
}

export const getI18n = cache(async () => {
  const lang = await getLang();
  const messages = await messagesFor(lang);
  return { lang, locale: localeFor(lang), dir: isRtl(lang) ? ("rtl" as const) : ("ltr" as const), messages, ...makeT(messages) };
});

export async function saveLanguagePreference(lang: string, userId?: string) {
  (await cookies()).set(LANG_COOKIE, lang, { path: "/", maxAge: 365 * 86_400, sameSite: "lax" });
  if (userId) {
    const { users } = await import("@/db/schema");
    await db.update(users).set({ language: lang }).where(eq(users.id, userId));
  }
}
