import "server-only";
import type { Stream } from "./data";
import type { AppSettings } from "./settings";
import { contentTranslator } from "./content-tx";
import { getI18n, getLanguages } from "@/i18n/server";

/** Stream names in the author's language and the languages a published version will be translated into. */
export async function editorLanguageProps(streams: Stream[], settings: AppSettings, writtenIn: string | null) {
  const [{ lang }, langs] = await Promise.all([getI18n(), getLanguages()]);
  const tx = await contentTranslator(lang, settings.defaultLanguage, streams.map((s) => ({ text: s.name, lang: settings.defaultLanguage })));
  const source = writtenIn ?? lang;
  return {
    streams: streams.map((s) => ({ ...s, name: tx.get(s.name, settings.defaultLanguage).text })),
    translateInto: settings.txOnPublish ? langs.filter((l) => l.enabled && l.code !== source).map((l) => l.native) : [],
  };
}
