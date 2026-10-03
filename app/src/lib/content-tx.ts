import "server-only";
import { cachedTranslations } from "./translate";

// Serves content in the reader's language from the translation cache. Text already in that language is shown as is;
// anything not cached yet is shown in the original and listed in `missing` so the page can ask for it.

export type Source = { text: string; lang: string | null | undefined };

// Translations made in the last two minutes count as "translated just now".
const FRESH_MS = 120_000;

export async function contentTranslator(target: string, fallbackLang: string, items: Source[]) {
  const needs = items.filter((i) => i.text && (i.lang ?? fallbackLang) !== target).map((i) => i.text);
  const cached = await cachedTranslations(target, needs);
  const missing = [...new Set(needs.filter((t) => !cached.has(t)))];
  return {
    missing,
    /** The text in the reader's language if available, and whether it was translated. */
    get(text: string, lang: string | null | undefined) {
      if (!text || (lang ?? fallbackLang) === target) return { text, translated: false, cached: false, reviewed: false, fresh: false };
      const hit = cached.get(text);
      return hit
        ? { text: hit.text, translated: hit.text !== text, cached: true, reviewed: hit.reviewed, fresh: Date.now() - hit.createdAt.getTime() < FRESH_MS }
        : { text, translated: false, cached: false, reviewed: false, fresh: false };
    },
  };
}

/** Splits a proposal body into its translatable units: section headings and paragraphs. */
export function bodyUnits(body: string) {
  return body
    .split(/\n\s*\n/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => (t.startsWith("## ") ? { h: true, text: t.slice(3) } : { h: false, text: t }));
}
