"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useToast } from "@/components/Toast";
import { useI18n } from "@/i18n/client";
import type { AppSettings } from "@/lib/settings";
import { MANDATE_PCT, MANDATE_VOTES } from "@/lib/settings-rules";
import { updateSetting } from "./actions";

const SCALES = [["5", "1 – 5"], ["10", "0 – 10"], ["100", "0 – 100"]] as const;
const WHO = [
  ["author", "set.whoAuthor", "set.whoAuthorText"],
  ["reviewers", "set.whoReviewers", "set.whoReviewersText"],
  ["both", "set.whoBoth", "set.whoBothText"],
] as const;
const TOGGLES = [
  ["requireStream", "set.requireStream", "set.requireStreamText"],
  ["showPublic", "set.showPublic", "set.showPublicText"],
] as const;

export function ScoringTab({ settings }: { settings: AppSettings }) {
  const [s, setLocal] = useOptimistic(settings, (cur, patch: Partial<AppSettings>) => ({ ...cur, ...patch }));
  const [, start] = useTransition();
  const toast = useToast();
  const { t } = useI18n();
  const [votes, setVotes] = useState(String(settings.mandateVotes));
  const saveVotes = () => {
    const n = Number(votes);
    if (!Number.isInteger(n) || n < MANDATE_VOTES.min || n > MANDATE_VOTES.max) {
      toast(t("set.errMandateVotes", { min: MANDATE_VOTES.min, max: MANDATE_VOTES.max }));
      setVotes(String(s.mandateVotes));
      return;
    }
    if (n !== s.mandateVotes) set("mandateVotes", n);
  };
  const pcts: number[] = [];
  for (let p = MANDATE_PCT.min; p <= MANDATE_PCT.max; p += MANDATE_PCT.step) pcts.push(p);
  const set = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) =>
    start(async () => {
      setLocal({ [key]: value } as Partial<AppSettings>);
      const r = await updateSetting(key, value as string | boolean | number);
      if (!r.ok) toast(r.error);
    });

  return (
    <div className="scoring">
      <div className="scoring-row">
        <div className="txt narrow"><b>{t("set.scale")}</b><span>{t("set.scaleText")}</span></div>
        <div className="segmented" role="group" aria-label={t("set.scale")}>
          {SCALES.map(([k, label]) => (
            <button key={k} aria-pressed={s.scale === k} onClick={() => set("scale", k)}>{label}</button>
          ))}
        </div>
      </div>
      <div className="scoring-row col">
        <div className="txt"><b>{t("set.whoScores")}</b><span>{t("set.whoScoresText")}</span></div>
        <div className="who-grid" role="radiogroup" aria-label={t("set.whoScores")}>
          {WHO.map(([k, title, desc]) => (
            <button key={k} className="who-opt" role="radio" aria-checked={s.scoredBy === k} data-value={k} onClick={() => set("scoredBy", k)}>
              <span className="ring"><span /></span>
              <span className="txt"><b>{t(title)}</b><span>{t(desc)}</span></span>
            </button>
          ))}
        </div>
      </div>
      {TOGGLES.map(([k, title, desc]) => (
        <div className="scoring-row toggle-row" key={k}>
          <div className="txt"><b>{t(title)}</b><span>{t(desc)}</span></div>
          <button className="toggle" role="switch" aria-checked={s[k]} aria-label={t(title)} onClick={() => set(k, !s[k])}><span /></button>
        </div>
      ))}
      <div className="scoring-row col" data-testid="mandate-rule">
        <div className="txt"><b>{t("set.mandate")}</b><span>{t("set.mandateText")}</span></div>
        <div className="mandate-rule">
          <label>
            <span>{t("set.mandatePct")}</span>
            <select value={s.mandatePct} onChange={(e) => set("mandatePct", Number(e.target.value))}>
              {pcts.map((p) => <option key={p} value={p}>{p}%</option>)}
            </select>
          </label>
          <label>
            <span>{t("set.mandateVotes")}</span>
            <input type="number" inputMode="numeric" min={MANDATE_VOTES.min} max={MANDATE_VOTES.max} value={votes} onChange={(e) => setVotes(e.target.value)} onBlur={saveVotes} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} />
          </label>
        </div>
      </div>
    </div>
  );
}
