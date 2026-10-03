"use client";

import { createContext, useContext, useMemo } from "react";
import { makeT } from "./core";
import type { Messages } from "./en";

type Ctx = { lang: string; locale: string; dir: "ltr" | "rtl" } & ReturnType<typeof makeT>;
const I18nContext = createContext<Ctx | null>(null);

export function I18nProvider({ lang, locale, dir, messages, children }: { lang: string; locale: string; dir: "ltr" | "rtl"; messages: Partial<Messages>; children: React.ReactNode }) {
  const value = useMemo(() => ({ lang, locale, dir, ...makeT(messages) }), [lang, locale, dir, messages]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside I18nProvider");
  return ctx;
}
