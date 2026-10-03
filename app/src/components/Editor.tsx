"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { BackIcon } from "@/components/icons";
import { Globe } from "@/components/LanguageMenu";
import { useToast } from "@/components/Toast";
import { useI18n } from "@/i18n/client";
import { formatScore, scaleSuffix, type Scale } from "@/lib/scale";
import { publish, saveDraft } from "@/app/(app)/actions";

export type EditorStream = { id: string; name: string; color: string; active: boolean };
export type EditorProps = {
  id: string | null;
  initial: { title: string; summary: string; body: string; scores: Record<string, number> };
  latestVersion: number | null;
  hasDraft: boolean;
  savedLabel: string | null;
  history: { number: number; note: string }[];
  streams: EditorStream[];
  scale: Scale;
  scoredBy: "author" | "reviewers" | "both";
  /** Native names of the languages a published version is translated into, if translating on publish. */
  translateInto: string[];
};

export function Editor(props: EditorProps) {
  const { id, latestVersion: L, streams, scale, scoredBy } = props;
  const router = useRouter();
  const toast = useToast();
  const { t, tn } = useI18n();
  const [pending, start] = useTransition();
  const [title, setTitle] = useState(props.initial.title);
  const [summary, setSummary] = useState(props.initial.summary);
  const [body, setBody] = useState(props.initial.body);
  const [note, setNote] = useState("");
  const [scores, setScores] = useState<Record<string, number>>(props.initial.scores);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<string | null>(props.savedLabel);

  const n = (L ?? 0) + 1;
  const vn = `v${n}`;
  const authorScores = scoredBy !== "reviewers";
  const sfx = scaleSuffix(scale);
  const items = streams.filter((s) => s.active || scores[s.id] != null);
  const edit = <T,>(set: (v: T) => void) => (v: T) => { set(v); setError(""); };

  const input = () => ({ id, title, summary, body, note, scores });

  const onSave = () =>
    start(async () => {
      const r = await saveDraft(input());
      if (!r.ok) return setError(r.error);
      setSaved(t("ago.justNow"));
      toast(t("ed.draftSaved"));
      if (!id) router.replace(`/proposals/${r.id}/edit`);
      else router.refresh();
    });

  const onPublish = () =>
    start(async () => {
      const r = await publish(input());
      if (!r.ok) return setError(r.error);
      const version = `v${r.version}`;
      toast(
        (r.translating ? tn("ed.publishedTranslating", r.translating, { version }) : t("ed.publishedToast", { version })) +
          (r.jev === "unavailable" ? " · " + t("ed.jevUnavailable") : ""),
      );
      router.push(`/proposals/${r.id}`);
    });

  const statusText = !id ? t("ed.statusNew") : L ? t("ed.statusPublished", { version: `v${L}` }) + (props.hasDraft ? " · " + t("ed.statusDraftOf", { version: vn }) : "") : t("ed.statusDraft");
  const scoreHint = authorScores ? (scoredBy === "both" ? t("ed.hintBoth") : t("ed.hintAuthor")) : t("ed.hintReviewers");

  return (
    <main className="edit-main" data-screen-label="Editor">
      <div className="edit-bar">
        <Link href={id ? `/proposals/${id}` : "/"} className="back-link"><BackIcon />{id ? t("ed.back") : t("ed.cancel")}</Link>
        <span className="sep">/</span>
        <span className="heading">{!id ? t("ed.newProposal") : L ? t("ed.editingVersion", { version: vn }) : t("ed.editingDraft")}</span>
        <div className="grow" />
        {saved ? <span className="saved">{t("ed.savedAt", { when: saved })}</span> : null}
        <button className="btn-secondary" onClick={onSave} disabled={pending}>{t("ed.saveDraft")}</button>
        <button className="btn-primary" onClick={onPublish} disabled={pending}>{pending ? t("ed.working") : L ? t("ed.publishVersion", { version: vn }) : t("ed.publish")}</button>
      </div>
      <div className="edit-cols">
        <div className="edit-paper">
          <textarea className="edit-title" value={title} onChange={(e) => edit(setTitle)(e.target.value)} placeholder={t("ed.titlePlaceholder")} aria-label={t("ed.titlePlaceholder")} rows={2} />
          <textarea className="edit-summary" value={summary} onChange={(e) => edit(setSummary)(e.target.value)} placeholder={t("ed.summaryPlaceholder")} aria-label={t("ed.summary")} rows={2} />
          <div className="edit-rule" />
          <textarea className="edit-body" value={body} onChange={(e) => edit(setBody)(e.target.value)} placeholder={t("ed.bodyPlaceholder")} aria-label={t("ed.body")} />
        </div>
        <aside className="edit-aside">
          <div className="card">
            <div className="stack">
              <span className="eyebrow">{t("ed.streamsScores")}</span>
              <span className="sub">{scoreHint}</span>
            </div>
            <div className="chips">
              {items.map((s) => {
                const on = scores[s.id] != null;
                return (
                  <button
                    key={s.id}
                    className="chip"
                    aria-pressed={on}
                    onClick={() => {
                      const next = { ...scores };
                      if (on) delete next[s.id]; else next[s.id] = 5;
                      edit(setScores)(next);
                    }}
                  >
                    <span className="dot dot-8" style={{ background: s.color }} />{s.name}
                  </button>
                );
              })}
            </div>
            {authorScores
              ? items.filter((s) => scores[s.id] != null).map((s) => (
                  <div className="slider-row" key={s.id}>
                    <div className="top"><span><span className="dot dot-8" style={{ background: s.color }} />{s.name}</span><b className="tabular">{formatScore(scores[s.id], scale)}{sfx}</b></div>
                    <input type="range" min={1} max={10} step={1} value={scores[s.id]} aria-label={t("ed.scoreFor", { stream: s.name })} onChange={(e) => edit(setScores)({ ...scores, [s.id]: Number(e.target.value) })} />
                  </div>
                ))
              : null}
          </div>
          <div className="card status-card">
            <div className="stack"><span className="eyebrow">{t("ed.status")}</span><span className="now">{statusText}</span></div>
            <label className="label">
              {L ? t("ed.whatChanged", { version: vn }) : t("ed.versionNote")}
              <textarea className="textarea" value={note} onChange={(e) => edit(setNote)(e.target.value)} placeholder={L ? t("ed.notePlaceholderChange") : t("ed.notePlaceholderInitial")} rows={3} />
              <span className="hint">{L ? t("ed.noteRequiredHint", { version: `v${L}` }) : t("ed.noteFirstHint")}</span>
            </label>
            {props.translateInto.length ? (
              <div className="tx-hint"><Globe size={14} /><span>{t("ed.txHint", { langs: props.translateInto.join(", ") })}</span></div>
            ) : null}
            {error ? <div className="error-text" role="alert">{error}</div> : null}
          </div>
          {L ? (
            <div className="card history-card">
              <span className="eyebrow">{t("ed.publishedVersions")}</span>
              {[...props.history].reverse().map((h) => (
                <div className="history-row" key={h.number}><b>v{h.number}</b><span>{h.note}</span></div>
              ))}
            </div>
          ) : null}
        </aside>
      </div>
    </main>
  );
}
