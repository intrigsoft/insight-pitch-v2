// Languages an admin can add. Each has an English name, its own name, a BCP 47 locale for dates, and direction.
export type LangInfo = { code: string; name: string; native: string; locale: string; rtl?: boolean };

export const LANGUAGE_CATALOG: LangInfo[] = [
  { code: "en", name: "English", native: "English", locale: "en-US" },
  { code: "si", name: "Sinhala", native: "සිංහල", locale: "si-LK" },
  { code: "ta", name: "Tamil", native: "தமிழ்", locale: "ta-LK" },
  { code: "hi", name: "Hindi", native: "हिन्दी", locale: "hi-IN" },
  { code: "es", name: "Spanish", native: "Español", locale: "es-ES" },
  { code: "fr", name: "French", native: "Français", locale: "fr-FR" },
  { code: "ar", name: "Arabic", native: "العربية", locale: "ar", rtl: true },
  { code: "pt", name: "Portuguese", native: "Português", locale: "pt-PT" },
  { code: "de", name: "German", native: "Deutsch", locale: "de-DE" },
  { code: "zh", name: "Chinese (Simplified)", native: "简体中文", locale: "zh-CN" },
  { code: "sw", name: "Swahili", native: "Kiswahili", locale: "sw" },
  { code: "uk", name: "Ukrainian", native: "Українська", locale: "uk-UA" },
  { code: "ja", name: "Japanese", native: "日本語", locale: "ja-JP" },
  { code: "he", name: "Hebrew", native: "עברית", locale: "he-IL", rtl: true },
  { code: "tr", name: "Turkish", native: "Türkçe", locale: "tr-TR" },
];

export const catalogEntry = (code: string) => LANGUAGE_CATALOG.find((l) => l.code === code);
export const localeFor = (code: string) => catalogEntry(code)?.locale ?? code;
export const isRtl = (code: string) => Boolean(catalogEntry(code)?.rtl);
