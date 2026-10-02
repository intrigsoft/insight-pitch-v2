"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { BackIcon } from "@/components/icons";
import { useToast } from "@/components/Toast";
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
};

export function Editor(props: EditorProps) {
  const { id, latestVersion: L, streams, scale, scoredBy } = props;
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [title, setTitle] = useState(props.initial.title);
  const [summary, setSummary] = useState(props.initial.summary);
  const [body, setBody] = useState(props.initial.body);
  const [note, setNote] = useState("");
  const [scores, setScores] = useState<Record<string, number>>(props.initial.scores);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<string | null>(props.savedLabel);

  const n = (L ?? 0) + 1;
  const authorScores = scoredBy !== "reviewers";
  const sfx = scaleSuffix(scale);
  const items = streams.filter((s) => s.active || scores[s.id] != null);
  const edit = <T,>(set: (v: T) => void) => (v: T) => { set(v); setError(""); };

  const input = () => ({ id, title, summary, body, note, scores });

  const onSave = () =>
    start(async () => {
      const r = await saveDraft(input());
      if (!r.ok) return setError(r.error);
      setSaved("just now");
      toast("Draft saved");
      if (!id) router.replace(`/proposals/${r.id}/edit`);
      else router.refresh();
    });

  const onPublish = () =>
    start(async () => {
      const r = await publish(input());
      if (!r.ok) return setError(r.error);
      toast(`Published v${r.version}` + (r.jev === "unavailable" ? " · Jev scoring unavailable, author scores kept" : ""));
      router.push(`/proposals/${r.id}`);
    });

  const statusText = !id
    ? "New · not saved yet"
    : L
      ? `Published v${L}` + (props.hasDraft ? ` · draft of v${n} in progress` : "")
      : "Draft · not published";
  const scoreHint = authorScores
    ? scoredBy === "both"
      ? "Pick the streams this affects and suggest a score. Jev confirms after publishing."
      : "Pick the streams this affects and score the impact on each."
    : "Pick the streams this affects. Jev assigns scores when you publish.";

  return (
    <main className="edit-main" data-screen-label="Editor">
      <div className="edit-bar">
        <Link href={id ? `/proposals/${id}` : "/"} className="back-link"><BackIcon />{id ? "Back to proposal" : "Cancel"}</Link>
        <span className="sep">/</span>
        <span className="heading">{!id ? "New proposal" : L ? `Editing v${n} draft` : "Editing draft"}</span>
        <div className="grow" />
        {saved ? <span className="saved">Draft saved {saved}</span> : null}
        <button className="btn-secondary" onClick={onSave} disabled={pending}>Save draft</button>
        <button className="btn-primary" onClick={onPublish} disabled={pending}>{pending ? "Working…" : L ? `Publish v${n}` : "Publish"}</button>
      </div>
      <div className="edit-cols">
        <div className="edit-paper">
          <textarea className="edit-title" value={title} onChange={(e) => edit(setTitle)(e.target.value)} placeholder="Proposal title" aria-label="Proposal title" rows={2} />
          <textarea className="edit-summary" value={summary} onChange={(e) => edit(setSummary)(e.target.value)} placeholder="One or two sentences that sum up the ask" aria-label="Summary" rows={2} />
          <div className="edit-rule" />
          <textarea className="edit-body" value={body} onChange={(e) => edit(setBody)(e.target.value)} placeholder="Write your proposal. Start a line with ## to add a section heading." aria-label="Proposal body" />
        </div>
        <aside className="edit-aside">
          <div className="card">
            <div className="stack">
              <span className="eyebrow">Streams &amp; scores</span>
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
                    <input type="range" min={1} max={10} step={1} value={scores[s.id]} aria-label={`${s.name} score`} onChange={(e) => edit(setScores)({ ...scores, [s.id]: Number(e.target.value) })} />
                  </div>
                ))
              : null}
          </div>
          <div className="card status-card">
            <div className="stack"><span className="eyebrow">Status</span><span className="now">{statusText}</span></div>
            <label className="label">
              {L ? `What changed in v${n}?` : "Version note (optional)"}
              <textarea className="textarea" value={note} onChange={(e) => edit(setNote)(e.target.value)} placeholder={L ? "e.g. Added cost estimate" : "Initial version"} rows={3} />
              <span className="hint">{L ? `Required. v1–v${L} stay readable in version history.` : "Publishing creates v1 and opens comments."}</span>
            </label>
            {error ? <div className="error-text" role="alert">{error}</div> : null}
          </div>
          {L ? (
            <div className="card history-card">
              <span className="eyebrow">Published versions</span>
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
