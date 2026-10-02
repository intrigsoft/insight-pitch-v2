"use client";

import { useOptimistic, useTransition } from "react";
import { useToast } from "@/components/Toast";
import type { AppSettings } from "@/lib/settings";
import { updateSetting } from "./actions";

const SCALES = [["5", "1 – 5"], ["10", "0 – 10"], ["100", "0 – 100"]] as const;
const WHO = [
  ["author", "Author", "Authors score their own proposal against each stream."],
  ["reviewers", "Reviewers", "Jev scores every proposal. Authors only pick streams."],
  ["both", "Author, then reviewers", "Authors suggest scores; Jev confirms or adjusts them."],
] as const;
const TOGGLES = [
  ["requireStream", "Require at least one stream to publish", "Proposals without a stream can still be saved as drafts."],
  ["showPublic", "Show scores on the public listing", "When off, the listing shows stream names only. Scores stay visible on each proposal."],
] as const;

export function ScoringTab({ settings }: { settings: AppSettings }) {
  const [s, setLocal] = useOptimistic(settings, (cur, patch: Partial<AppSettings>) => ({ ...cur, ...patch }));
  const [, start] = useTransition();
  const toast = useToast();
  const set = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) =>
    start(async () => {
      setLocal({ [key]: value } as Partial<AppSettings>);
      const r = await updateSetting(key, value as string | boolean);
      if (!r.ok) toast(r.error);
    });

  return (
    <div className="scoring">
      <div className="scoring-row">
        <div className="txt narrow"><b>Score scale</b><span>How stream scores are shown everywhere on the site. Changing it converts existing scores.</span></div>
        <div className="segmented" role="group" aria-label="Score scale">
          {SCALES.map(([k, label]) => (
            <button key={k} aria-pressed={s.scale === k} onClick={() => set("scale", k)}>{label}</button>
          ))}
        </div>
      </div>
      <div className="scoring-row col">
        <div className="txt"><b>Who assigns scores</b><span>Authors always choose which streams their proposal belongs to.</span></div>
        <div className="who-grid" role="radiogroup" aria-label="Who assigns scores">
          {WHO.map(([k, title, desc]) => (
            <button key={k} className="who-opt" role="radio" aria-checked={s.scoredBy === k} onClick={() => set("scoredBy", k)}>
              <span className="ring"><span /></span>
              <span className="txt"><b>{title}</b><span>{desc}</span></span>
            </button>
          ))}
        </div>
      </div>
      {TOGGLES.map(([k, title, desc]) => (
        <div className="scoring-row toggle-row" key={k}>
          <div className="txt"><b>{title}</b><span>{desc}</span></div>
          <button className="toggle" role="switch" aria-checked={s[k]} aria-label={title} onClick={() => set(k, !s[k])}><span /></button>
        </div>
      ))}
    </div>
  );
}
