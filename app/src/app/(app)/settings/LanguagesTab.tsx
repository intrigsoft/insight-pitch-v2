"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useToast } from "@/components/Toast";
import { useI18n } from "@/i18n/client";
import { addLanguage, clearTranslationCache, removeLanguage, setDefaultLanguage, setGlossary, setLanguageEnabled, updateSetting } from "./actions";

type Lang = { code: string; name: string; native: string; rtl: boolean; enabled: boolean; cached: number; accuracy: number | null };
type CatalogLang = { code: string; name: string; native: string };
type LangSettings = { defaultLanguage: string; txOnPublish: boolean; txComments: boolean; txLabel: boolean; glossary: string[] };

const TOGGLES = [
  ["txOnPublish", "lang.onPublish", "lang.onPublishText"],
  ["txComments", "lang.comments", "lang.commentsText"],
  ["txLabel", "lang.label", "lang.labelText"],
] as const;

export function LanguagesTab({ languages, catalog, settings }: { languages: Lang[]; catalog: CatalogLang[]; settings: LangSettings }) {
  const { t, tn } = useI18n();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [pick, setPick] = useState("");
  const [term, setTerm] = useState("");
  const [s, patchLocal] = useOptimistic(settings, (cur, p: Partial<LangSettings>) => ({ ...cur, ...p }));
  const [rows, toggleLocal] = useOptimistic(languages, (cur, p: { code: string; enabled: boolean }) => cur.map((l) => (l.code === p.code ? { ...l, enabled: p.enabled } : l)));

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, done?: string, local?: () => void) =>
    start(async () => {
      local?.();
      const r = await fn();
      if (!r.ok) toast(r.error ?? t("err.generic"));
      else if (done) toast(done);
    });

  const enabledCount = rows.filter((l) => l.enabled).length;
  const totalCached = rows.reduce((a, l) => a + l.cached, 0);
  const withCache = rows.filter((l) => l.cached > 0).length;
  const addTerm = () => {
    const x = term.trim();
    if (!x) return;
    setTerm("");
    if (s.glossary.some((g) => g.toLowerCase() === x.toLowerCase())) return;
    const next = [...s.glossary, x];
    run(() => setGlossary(next), undefined, () => patchLocal({ glossary: next }));
  };

  return (
    <div className="langs-wrap">
      <div className="streams-wrap">
        <div className="streams-bar">
          <span>{t("lang.summary", { n: rows.length, enabled: enabledCount })}</span>
          <div className="add-lang">
            <select value={pick} onChange={(e) => setPick(e.target.value)} aria-label={t("lang.choose")}>
              <option value="">{t("lang.choose")}</option>
              {catalog.map((c) => <option key={c.code} value={c.code}>{c.native} · {c.name}</option>)}
            </select>
            <button
              className="btn-primary"
              disabled={!pick || pending}
              onClick={() => {
                const c = catalog.find((x) => x.code === pick)!;
                setPick("");
                run(() => addLanguage(c.code), t("lang.added", { lang: c.native }));
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
              {t("lang.add")}
            </button>
          </div>
        </div>
        <div className="stream-table-wrap">
          <div className="stream-table lang-table" role="table" aria-label={t("set.tabLanguages")}>
            <div className="lang-row st-head" role="row">
              <span role="columnheader">{t("lang.colLanguage")}</span><span role="columnheader">{t("lang.colDirection")}</span><span role="columnheader">{t("lang.colCached")}</span><span role="columnheader" title={t("lang.accuracyHelp")}>{t("lang.colAccuracy")}</span><span role="columnheader">{t("lang.colStatus")}</span><span />
            </div>
            {rows.map((l) => {
              const isDefault = l.code === s.defaultLanguage;
              return (
                <div className="lang-row" role="row" key={l.code} data-testid={`lang-${l.code}`}>
                  <div className={`lang-names${l.enabled ? "" : " inactive"}`} role="cell">
                    <b lang={l.code}>{l.native}{isDefault ? <span className="latest-tag">{t("lang.default")}</span> : null}</b>
                    <span lang="en">{l.name} · {l.code.toUpperCase()}</span>
                  </div>
                  <span className={`lang-cell${l.enabled ? "" : " inactive"}`} role="cell">{l.rtl ? t("lang.rtl") : t("lang.ltr")}</span>
                  <span className={`lang-cell tabular${l.enabled ? "" : " inactive"}`} role="cell">{isDefault ? "—" : tn("lang.sections", l.cached)}</span>
                  <span className={`lang-cell tabular${l.enabled ? "" : " inactive"}`} role="cell" title={t("lang.accuracyHelp")} data-testid={`accuracy-${l.code}`}>{isDefault || l.accuracy == null ? "—" : `${l.accuracy}%`}</span>
                  <div className="st-status" role="cell">
                    {isDefault ? (
                      <span className="muted-cell">{t("lang.alwaysOn")}</span>
                    ) : (
                      <>
                        <button
                          className="toggle"
                          role="switch"
                          aria-checked={l.enabled}
                          aria-label={t("lang.toggle", { lang: l.name })}
                          onClick={() => run(() => setLanguageEnabled(l.code, !l.enabled), t(l.enabled ? "lang.turnedOff" : "lang.turnedOn", { lang: l.native }), () => toggleLocal({ code: l.code, enabled: !l.enabled }))}
                        ><span /></button>
                        <span>{l.enabled ? t("lang.enabled") : t("lang.off")}</span>
                      </>
                    )}
                  </div>
                  <div className="lang-remove">
                    {!isDefault ? <button className="del-link" onClick={() => run(() => removeLanguage(l.code), t("lang.removed", { lang: l.native }))}>{t("lang.remove")}</button> : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <p className="small-note">{t("lang.note")}</p>
      </div>

      <div className="scoring lang-settings">
        <div className="scoring-row">
          <div className="txt"><b>{t("lang.defaultLanguage")}</b><span>{t("lang.defaultLanguageText")}</span></div>
          <select
            className="lang-select"
            value={s.defaultLanguage}
            aria-label={t("lang.defaultLanguage")}
            onChange={(e) => {
              const v = e.target.value;
              run(() => setDefaultLanguage(v), undefined, () => patchLocal({ defaultLanguage: v }));
            }}
          >
            {rows.filter((l) => l.enabled).map((l) => <option key={l.code} value={l.code}>{l.native} · {l.name}</option>)}
          </select>
        </div>
        {TOGGLES.map(([k, title, desc]) => (
          <div className="scoring-row toggle-row" key={k}>
            <div className="txt"><b>{t(title)}</b><span>{t(desc)}</span></div>
            <button className="toggle" role="switch" aria-checked={s[k]} aria-label={t(title)} onClick={() => run(() => updateSetting(k, !s[k]), undefined, () => patchLocal({ [k]: !s[k] }))}><span /></button>
          </div>
        ))}
        <div className="scoring-row col">
          <div className="txt"><b>{t("lang.never")}</b><span>{t("lang.neverText")}</span></div>
          <div className="gloss">
            {s.glossary.map((g) => (
              <span key={g} className="gloss-term">
                {g}
                <button
                  title={t("lang.removeTerm", { term: g })}
                  aria-label={t("lang.removeTerm", { term: g })}
                  onClick={() => {
                    const next = s.glossary.filter((x) => x !== g);
                    run(() => setGlossary(next), undefined, () => patchLocal({ glossary: next }));
                  }}
                >×</button>
              </span>
            ))}
            <input
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTerm(); } }}
              placeholder={t("lang.addTerm")}
              aria-label={t("lang.addTerm")}
            />
          </div>
        </div>
        <div className="scoring-row">
          <div className="txt"><b>{t("lang.cache")}</b><span>{t("lang.cacheText")} {totalCached ? tn("lang.cacheLine", totalCached, { langs: withCache }) : t("lang.cacheEmpty")}</span></div>
          <button className="btn-secondary danger-text" disabled={pending || !totalCached} onClick={() => run(() => clearTranslationCache(), t("lang.cacheCleared"))}>{t("lang.clearCache")}</button>
        </div>
      </div>
    </div>
  );
}
