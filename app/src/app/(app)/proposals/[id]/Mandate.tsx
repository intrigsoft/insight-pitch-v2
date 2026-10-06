"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import { CheckIcon, CrossIcon } from "@/components/icons";
import { useI18n } from "@/i18n/client";
import type { Stance, Tally } from "@/lib/vote-tally";
import { castVote, sendVoteReason, setVoteMin } from "../../vote-actions";

export type MandateView = {
  proposalId: string;
  tally: Tally;
  mine: Stance | null;
  min: number;
  rule: { pct: number; votes: number };
  /** Share of support over time, ending now; the threshold line is drawn at rule.pct. */
  trend: number[];
  trendFrom: string;
  isLead: boolean;
  minOptions: number[];
  /** For the lead: what people who oppose said would need to change. */
  reasons: { text: string; when: string }[] | null;
  reasonMax: number;
};

/** The public mandate card: the share of people who support the proposal, and the vote buttons. */
export function MandateCard({ v }: { v: MandateView }) {
  const { t, tn } = useI18n();
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [reason, setReason] = useState<string | null>(null);
  const [showReasons, setShowReasons] = useState(false);
  const { tally: tl, rule } = v;

  const run = (fn: () => Promise<{ ok: true; message?: string } | { ok: false; error: string }>, onOk?: () => void) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) return toast(r.error);
      if (r.message) toast(r.message);
      onOk?.();
      router.refresh();
    });
  const vote = (k: Stance) => {
    const next = v.mine === k ? null : k;
    run(() => castVote(v.proposalId, next), () => setReason(next === "oppose" ? "" : null));
  };

  const need = rule.votes - tl.total;
  const status = tl.mandate
    ? t("md.statusReached", { pct: rule.pct, n: rule.votes })
    : need > 0 && tl.pct < rule.pct
      ? t("md.statusNeeds", { pct: rule.pct, n: rule.votes })
      : need > 0
        ? tn("md.statusMore", need)
        : t("md.statusPct", { pct: rule.pct });

  // Scale the trend so the threshold and every point fit, with a little room above and below.
  const tr = v.trend;
  const lo = Math.max(0, Math.min(...tr, rule.pct) - 8), hi = Math.min(100, Math.max(...tr, rule.pct) + 6);
  const y = (x: number) => (40 - ((x - lo) / (hi - lo || 1)) * 40).toFixed(1);
  const points = tr.map((x, i) => `${((i / (tr.length - 1)) * 100).toFixed(1)},${y(x)}`).join(" ");

  return (
    <section className="card mandate" data-screen-label="Mandate" aria-label={t("md.title")}>
      <div className="row-head">
        <span className="eyebrow">{t("md.title")}</span>
        {tl.mandate ? <span className="mandate-pill lg"><CheckIcon size={12} width={2.6} />{t("md.reached")}</span> : null}
      </div>

      {tl.shown ? (
        <>
          <div className="md-figure">
            <div className="md-big"><span className="md-pct">{tl.pct}%</span><span>{tn("md.ofVotes", tl.total)}</span></div>
            <div className="md-bar" title={t("md.barTitle")}>
              <div style={{ width: `${tl.pct}%` }} />
              <span style={{ left: `${rule.pct}%` }} />
            </div>
            <div className="md-split"><span>{t("md.support", { n: tl.support })}</span><span>{t("md.oppose", { n: tl.oppose })}</span></div>
          </div>
          <div className="md-status">{status}</div>
        </>
      ) : (
        <div className="md-hidden">
          <span className="md-count">{tn("md.soFar", tl.total)}</span>
          <span>{t("md.hiddenNote", { n: v.min })}</span>
        </div>
      )}

      <div className="md-vote">
        <div className="md-buttons">
          <button className={`md-btn sup${v.mine === "support" ? " on" : ""}`} aria-pressed={v.mine === "support"} disabled={pending} onClick={() => vote("support")}>
            <CheckIcon size={15} />{v.mine === "support" ? t("md.supported") : t("md.supportBtn")}
          </button>
          <button className={`md-btn opp${v.mine === "oppose" ? " on" : ""}`} aria-pressed={v.mine === "oppose"} disabled={pending} onClick={() => vote("oppose")}>
            <CrossIcon size={14} />{v.mine === "oppose" ? t("md.opposed") : t("md.opposeBtn")}
          </button>
        </div>
        {reason !== null && v.mine === "oppose" ? (
          <div className="md-reason">
            <label htmlFor="md-reason">{t("md.reasonQ")}</label>
            <textarea id="md-reason" rows={3} maxLength={v.reasonMax} value={reason} placeholder={t("md.reasonPh")} onChange={(e) => setReason(e.target.value)} />
            <div className="md-reason-actions">
              <button className="btn-text" onClick={() => setReason(null)}>{t("md.skip")}</button>
              <button className="btn-pill" disabled={!reason.trim() || pending} onClick={() => run(() => sendVoteReason(v.proposalId, reason), () => setReason(null))}>{t("md.send")}</button>
            </div>
          </div>
        ) : null}
        <span className="md-hint">{v.mine ? t("md.hintVoted") : t("md.hint")}</span>
      </div>

      {tl.shown && tr.length > 1 ? (
        <div className="md-trend">
          <div className="md-trend-head"><b>{t("md.trend")}</b><span><span className="dash" />{t("md.threshold", { pct: `${rule.pct}%` })}</span></div>
          <svg viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true">
            <line x1="0" x2="100" y1={y(rule.pct)} y2={y(rule.pct)} stroke="#8f958f" strokeWidth="1" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
            <polyline points={points} fill="none" stroke="#2e5e45" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          </svg>
          <div className="md-trend-axis"><span>{v.trendFrom}</span><span>{t("md.now")}</span></div>
        </div>
      ) : null}

      {v.reasons && v.reasons.length ? (
        <div className="md-reasons">
          <button className="md-reasons-toggle" aria-expanded={showReasons} onClick={() => setShowReasons(!showReasons)}>
            {tn("md.reasons", v.reasons.length)}
          </button>
          {showReasons ? (
            <ul>
              {v.reasons.map((r, i) => <li key={i}><span>{r.text}</span><span className="when">{r.when}</span></li>)}
            </ul>
          ) : null}
        </div>
      ) : null}

      {v.isLead ? (
        <label className="md-min">
          <span><b>{t("md.minLabel")}</b><span>{t("md.leadSetting")}</span></span>
          <select value={v.min} disabled={pending} onChange={(e) => run(() => setVoteMin(v.proposalId, Number(e.target.value)))}>
            {v.minOptions.map((n) => <option key={n} value={n}>{tn("md.votes", n)}</option>)}
          </select>
        </label>
      ) : null}
    </section>
  );
}
