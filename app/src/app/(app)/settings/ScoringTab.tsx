"use client";

import { useOptimistic, useTransition } from "react";
import { useToast } from "@/components/Toast";
import { useI18n } from "@/i18n/client";
import type { AppSettings } from "@/lib/settings";
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
  const set = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) =>
    start(async () => {
      setLocal({ [key]: value } as Partial<AppSettings>);
      const r = await updateSetting(key, value as string | boolean);
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
    </div>
  );
}
