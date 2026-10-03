// Pure check, kept free of server-only imports so tests can run it directly.
const SCRIPTS: Record<string, RegExp> = {
  si: /[඀-෿]/g,
  ta: /[஀-௿]/g,
  hi: /[ऀ-ॿ]/g,
  ar: /[؀-ۿ]/g,
  he: /[֐-׿]/g,
  zh: /[一-鿿]/g,
  ja: /[぀-ヿ]/g,
  uk: /[Ѐ-ӿ]/g,
};

/** Describes text left in another language's script, or null. Latin is allowed: names, glossary terms, units. */
export function leftoverScript(source: string, translation: string, target: string): string | null {
  for (const [code, re] of Object.entries(SCRIPTS)) {
    if (code === target || (target === "ja" && code === "zh")) continue;
    const inSource = (source.match(re) ?? []).length;
    const left = (translation.match(re) ?? []).length;
    if (inSource > 0 && left > 0) return `Some words were left in the original script (${code}); translate every word except names and the never-translate terms.`;
  }
  return null;
}

