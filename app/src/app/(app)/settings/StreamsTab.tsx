"use client";

import { useEffect, useOptimistic, useState, useTransition } from "react";
import { useToast } from "@/components/Toast";
import type { Stream } from "@/lib/data";
import { deleteStream, saveStream, setStreamActive } from "./actions";

type Row = Stream & { count: number };
type Draft = { id: string | null; name: string; description: string; color: string; active: boolean; related: string[]; error: string };

export function StreamsTab({ streams, colors }: { streams: Row[]; colors: string[] }) {
  const toast = useToast();
  const [pending, start] = useTransition();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [rows, setActiveLocal] = useOptimistic(streams, (cur, p: { id: string; active: boolean }) => cur.map((s) => (s.id === p.id ? { ...s, active: p.active } : s)));
  const activeCount = rows.filter((s) => s.active).length;
  const byId = (id: string) => rows.find((s) => s.id === id);

  useEffect(() => {
    if (!draft) return;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setDraft(null); };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [draft]);

  const open = (s: Row | null) =>
    setDraft(s ? { id: s.id, name: s.name, description: s.description, color: s.color, active: s.active, related: [...s.related], error: "" } : { id: null, name: "", description: "", color: colors[0], active: true, related: [], error: "" });
  const patch = (p: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...p } : d));

  const toggle = (s: Row) =>
    start(async () => {
      setActiveLocal({ id: s.id, active: !s.active });
      const r = await setStreamActive(s.id, !s.active);
      toast(r.ok ? `${s.name} ${s.active ? "deactivated" : "activated"}` : r.error);
    });

  const save = () =>
    start(async () => {
      if (!draft) return;
      const r = await saveStream({ id: draft.id, name: draft.name, description: draft.description, color: draft.color, active: draft.active, related: draft.related });
      if (!r.ok) return patch({ error: r.error });
      toast(draft.id ? "Stream updated" : "Stream added");
      setDraft(null);
    });

  const remove = () =>
    start(async () => {
      if (!draft?.id) return;
      const r = await deleteStream(draft.id);
      if (!r.ok) return patch({ error: r.error });
      toast("Stream deleted");
      setDraft(null);
    });

  const inUse = draft?.id ? byId(draft.id)?.count ?? 0 : 0;

  return (
    <div className="streams-wrap">
      <div className="streams-bar">
        <span>{rows.length} streams · {activeCount} active</span>
        <button className="btn-primary" onClick={() => open(null)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
          Add stream
        </button>
      </div>
      <div className="stream-table-wrap">
        <div className="stream-table" role="table" aria-label="Streams">
          <div className="st-row st-head" role="row">
            <span role="columnheader">Stream</span><span role="columnheader">Overlaps with</span><span role="columnheader">Proposals</span><span role="columnheader">Status</span><span />
          </div>
          {rows.map((s) => {
            const related = s.related.map(byId).filter(Boolean) as Row[];
            return (
              <div className="st-row" role="row" key={s.id} data-testid={`stream-${s.id}`}>
                <div className={`st-name${s.active ? "" : " inactive"}`} role="cell">
                  <span className="st-swatch" style={{ background: s.color }} />
                  <div className="txt"><b>{s.name}</b><span>{s.description}</span></div>
                </div>
                <div className={`rel-chips${s.active ? "" : " inactive"}`} role="cell">
                  {related.map((r) => <span key={r.id} className="rel-chip"><span className="dot dot-7" style={{ background: r.color }} />{r.name}</span>)}
                  {related.length === 0 ? <span className="rel-none">None</span> : null}
                </div>
                <span className="st-count" role="cell">{s.count}</span>
                <div className="st-status" role="cell">
                  <button className="toggle" role="switch" aria-checked={s.active} aria-label={`${s.name} active`} title="Toggle active" onClick={() => toggle(s)}><span /></button>
                  <span>{s.active ? "Active" : "Inactive"}</span>
                </div>
                <button className="st-edit" onClick={() => open(s)} aria-label={`Edit ${s.name}`}>Edit</button>
              </div>
            );
          })}
        </div>
      </div>
      <p className="small-note">Inactive streams stay on existing proposals but can&apos;t be picked for new ones and are hidden from the public filter.</p>

      {draft ? (
        <>
          <button className="scrim" aria-label="Close" onClick={() => setDraft(null)} />
          <div className="drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title">
            <div className="drawer-head">
              <h2 id="drawer-title">{draft.id ? "Edit stream" : "New stream"}</h2>
              <button className="drawer-close" onClick={() => setDraft(null)} aria-label="Close">×</button>
            </div>
            <div className="drawer-body">
              <label className="label">Name
                <input className="field" autoFocus value={draft.name} onChange={(e) => patch({ name: e.target.value, error: "" })} placeholder="e.g. Agriculture" />
              </label>
              <label className="label">Description
                <textarea className="textarea" rows={3} value={draft.description} onChange={(e) => patch({ description: e.target.value })} placeholder="What kinds of proposals belong here?" />
              </label>
              <div className="drawer-group">
                <span className="ttl">Colour</span>
                <div className="swatches" role="radiogroup" aria-label="Colour">
                  {colors.map((hex) => (
                    <button key={hex} className="swatch" role="radio" aria-checked={draft.color === hex} aria-label={hex} onClick={() => patch({ color: hex })}
                      style={{ background: hex, boxShadow: draft.color === hex ? `0 0 0 2px #fff, 0 0 0 4px ${hex}` : "none" }} />
                  ))}
                </div>
              </div>
              <div className="drawer-group">
                <div className="stack" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <span className="ttl">Overlaps with</span>
                  <span className="sub-hint">Linked streams are suggested together when authors tag a proposal.</span>
                </div>
                <div className="chips">
                  {rows.filter((x) => x.id !== draft.id).map((x) => {
                    const on = draft.related.includes(x.id);
                    return (
                      <button key={x.id} className="chip" aria-pressed={on} onClick={() => patch({ related: on ? draft.related.filter((r) => r !== x.id) : [...draft.related, x.id] })}>
                        <span className="dot dot-8" style={{ background: x.color }} />{x.name}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="drawer-row">
                <div className="stack" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <span className="ttl" style={{ fontSize: 13, fontWeight: 500 }}>Active</span>
                  <span className="sub-hint">Available for new proposals and public filters.</span>
                </div>
                <button className="toggle" role="switch" aria-checked={draft.active} aria-label="Active" onClick={() => patch({ active: !draft.active })}><span /></button>
              </div>
              {draft.error ? <div className="error-text" role="alert">{draft.error}</div> : null}
            </div>
            <div className="drawer-foot">
              {draft.id && inUse === 0 ? <button className="del" onClick={remove} disabled={pending}>Delete stream</button> : null}
              {inUse > 0 ? <span className="inuse">Used by {inUse} {inUse === 1 ? "proposal" : "proposals"}. Deactivate instead of deleting.</span> : null}
              <div className="grow" />
              <button className="btn-secondary" onClick={() => setDraft(null)}>Cancel</button>
              <button className="btn-primary" onClick={save} disabled={pending}>Save stream</button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
