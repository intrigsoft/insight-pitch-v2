"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { BackIcon } from "@/components/icons";
import { useToast } from "@/components/Toast";
import { useI18n } from "@/i18n/client";
import { hunkLabel, hunkRows, mergeRequest, showBlock, wordDiff, type Decision, type DiffPart, type Doc, type HunkLabel } from "@/lib/merge";
import { mergeChangeRequest, setChangeRequestStatus } from "../../../../team-actions";

type Props = {
  proposalId: string;
  crId: string;
  proposalTitle: string;
  note: string;
  status: "open" | "merged" | "returned" | "closed" | "withdrawn";
  author: { id: string; name: string; initials: string; first: string };
  lead: string;
  isLead: boolean;
  isAuthor: boolean;
  base: number;
  latest: number;
  draftSaved: string | null;
  metaLine: string;
  accepted: number | null;
  total: number | null;
  docs: { base: Doc; ours: Doc; theirs: Doc };
  oursSig: string;
};

function Parts({ parts, tone }: { parts: DiffPart[]; tone?: "add" | "del" }) {
  return (
    <>
      {parts.map((p, i) => (
        <span key={i} className={p.kind !== "same" ? `seg ${p.kind}` : tone ? `seg-${tone}` : undefined}>{p.text}</span>
      ))}
    </>
  );
}

export function Review({ v }: { v: Props }) {
  const { t, tn } = useI18n();
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [dec, setDec] = useState<Record<number, Decision>>({});
  const [edits, setEdits] = useState<Record<number, string>>({});
  const open = v.status === "open";
  const canDecide = open && v.isLead;
  const labels = { image: t("rv.image"), video: t("rv.video"), file: t("rv.file") };
  const { chunks, hunks } = useMemo(() => mergeRequest(v.docs.base, v.docs.ours, v.docs.theirs), [v.docs]);
  const ver = (n: number) => `v${n}`;

  const label = (l: HunkLabel) => ("n" in l ? tn(`rv.h.${l.kind}`, l.n) : l.kind === "newSection" ? t("rv.h.newSection") : l.kind === "editedAdded" ? t("rv.h.editedAdded") : t(`rv.h.${l.kind}`));
  // Pressing the chosen option again clears the decision.
  const decide = (idx: number, val: Decision) =>
    setDec((d) => {
      const next = { ...d };
      if (next[idx] === val && val !== "edit") delete next[idx];
      else next[idx] = val;
      return next;
    });
  const strip = (arr: string[]) => arr.map((x) => x.replace(/^@@(title|summary) /, "")).join("\n\n");

  const oursLabel = v.isLead ? (v.draftSaved ? t("rv.yourDraft") : t("rv.latestV", { version: ver(v.latest) })) : t("rv.latestV", { version: ver(v.latest) });
  const theirsLabel = v.isAuthor ? t("rv.yourVersion") : t("rv.nameVersion", { name: v.author.first });
  const who = v.isAuthor ? t("rv.you") : v.author.first;

  // Walk the chunks: unchanged paragraphs become faded context, the rest become change cards.
  type Item =
    | { kind: "context"; blocks: { heading: boolean; text: string }[] }
    | { kind: "hunk" | "conflict"; idx: number; label: string; section: string; base: string[]; ours: string[]; theirs: string[] };
  const items: Item[] = [];
  let section = "";
  const secOf = (arr: string[]) => arr.forEach((x) => { if (x.startsWith("## ")) section = x.slice(3); });
  for (const ch of chunks) {
    if (ch.idx == null) {
      for (const x of ch.ours.filter((y) => !y.startsWith("@@"))) {
        const d = showBlock(x, labels);
        const last = items[items.length - 1];
        if (last?.kind === "context") last.blocks.push({ heading: Boolean(d.heading), text: d.text });
        else items.push({ kind: "context", blocks: [{ heading: Boolean(d.heading), text: d.text }] });
      }
      secOf(ch.base.length ? ch.base : ch.ours);
      continue;
    }
    const meta = [...ch.base, ...ch.theirs].some((x) => x.startsWith("@@"));
    items.push({ kind: ch.kind === "conflict" ? "conflict" : "hunk", idx: ch.idx, label: label(hunkLabel(ch.base, ch.theirs)), section: meta ? "" : section, base: ch.base, ours: ch.ours, theirs: ch.theirs });
    secOf(ch.base);
  }

  const nH = hunks.length, nC = hunks.filter((h) => h.kind === "conflict").length;
  const decided = hunks.filter((h) => dec[h.idx!]).length;
  const acc = hunks.filter((h) => ["accept", "theirs", "edit"].includes(dec[h.idx!])).length;
  const rej = hunks.filter((h) => ["reject", "mine"].includes(dec[h.idx!])).length;
  const ready = decided === nH;
  const changes = tn("rv.changes", nH);

  const intro = open
    ? v.isLead
      ? t("rv.introLead", { cmp: v.draftSaved ? t("rv.cmpDraft", { when: v.draftSaved }) : t("rv.cmpLatest", { version: ver(v.latest) }), changes, who }) + " " + (nC ? tn("rv.overlap", nC, { version: ver(v.base) }) : t("rv.noOverlap", { version: ver(v.base) }))
      : v.isAuthor ? t("rv.introMine", { changes, lead: v.lead }) : t("rv.introOther", { author: v.author.first, changes, lead: v.lead })
    : t("rv.introClosed", { author: v.author.first, version: ver(v.base) });

  let stateLine = "";
  if (!open) {
    stateLine =
      v.status === "merged" ? (v.isLead ? t("rv.stMergedYour") : t("rv.stMergedLead", { name: v.lead })) + (v.total ? " · " + t("rv.stAccepted", { a: v.accepted ?? 0, n: v.total }) : "")
      : v.status === "returned" ? (v.isAuthor ? t("rv.stReturnedYou") : t("rv.stReturned", { name: v.author.first }))
      : v.status === "closed" ? t("rv.stClosed") : t("rv.stWithdrawn");
  } else if (!v.isLead && !v.isAuthor) stateLine = t("rv.waiting", { name: v.lead });

  const statusLabel = canDecide ? t("rv.needsYourReview") : t(`cr.st.${v.status}`);

  const act = (fn: () => Promise<{ ok: true; message?: string; proposalId: string } | { ok: false; error: string }>) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) return toast(r.error);
      if (r.message) toast(r.message);
      router.push(`/proposals/${v.proposalId}`);
      router.refresh();
    });
  const apply = () => {
    if (!ready) return toast(t("rv.decideAll"));
    act(() => mergeChangeRequest(v.crId, dec, edits, v.oursSig));
  };

  return (
    <main className="view-main review-main" data-screen-label="Change request">
      <Link href={`/proposals/${v.proposalId}`} className="back-link"><BackIcon />{t("rv.back")}</Link>
      <div className="view-cols">
        <article className="view-article review-article">
          <div className="rv-head">
            <div className="rv-kick"><span className="eyebrow green">{t("rv.kicker")}</span><span className={`cr-st ${v.status}`}>{statusLabel}</span></div>
            <h1 className="rv-title">{v.note}</h1>
            <div className="rv-by">
              <span className="avatar av-30">{v.author.initials}</span>
              <Link href={`/people/${v.author.id}`} className="name-link"><b>{v.author.name}</b></Link>
              <span>·</span><span>{v.metaLine}</span>
            </div>
            <Link href={`/proposals/${v.proposalId}`} className="rv-proposal">{v.proposalTitle}</Link>
          </div>
          <div className="rv-intro">{intro}</div>
          <div className="rv-chunks">
            {items.map((it, i) => {
              if (it.kind === "context")
                return (
                  <div className="rv-context" key={`c${i}`}>
                    {it.blocks.map((b, j) => (b.heading ? <span key={j} className="h">{b.text}</span> : <span key={j} className="p">{b.text}</span>))}
                  </div>
                );
              const d = dec[it.idx];
              if (it.kind === "hunk") {
                const accd = d === "accept", rejd = d === "reject";
                return (
                  <section key={`h${it.idx}`} className={`rv-hunk${accd ? " accepted" : ""}`} aria-label={it.label} data-testid="cr-hunk">
                    <div className="rv-hunk-head">
                      <span className="lbl">{it.label}</span>
                      {it.section ? <span className="sec">{t("rv.in", { section: it.section })}</span> : null}
                      <span className="grow" />
                      {canDecide ? (
                        <div className="rv-acts">
                          <button className={`rv-btn${rejd ? " rejected" : ""}`} aria-pressed={rejd} onClick={() => decide(it.idx, "reject")}>{rejd ? t("rv.rejected") : t("rv.reject")}</button>
                          <button className={`rv-btn${accd ? " accepted" : ""}`} aria-pressed={accd} onClick={() => decide(it.idx, "accept")}>{accd ? t("rv.accepted") : t("rv.accept")}</button>
                        </div>
                      ) : null}
                    </div>
                    <div className={`rv-rows${rejd ? " dim" : ""}`}>
                      {hunkRows(it.base, it.theirs, labels).map((r, j) => (
                        <div key={j} className={`rv-row ${r.mark}`}>
                          <span className="mk" aria-hidden="true">{r.mark === "add" ? "+" : r.mark === "del" ? "−" : "±"}</span>
                          <div className="tx">
                            {r.shown.meta ? <span className="meta">{t(`rv.h.${r.shown.meta}`)}</span> : null}
                            {r.shown.heading ? <span className="h">{r.shown.text}</span> : <span className="p"><Parts parts={r.parts} tone={r.mark === "edit" ? undefined : r.mark} /></span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                );
              }
              const bt = it.base.map((x) => showBlock(x, labels).text).join("\n\n");
              const side = (arr: string[], key: "mine" | "theirs", lbl: string) => {
                const on = d === key;
                const tx = arr.map((x) => showBlock(x, labels).text).join("\n\n");
                return (
                  <button key={key} type="button" role={canDecide ? "radio" : undefined} aria-checked={canDecide ? on : undefined} className={`rv-opt${on ? " on" : ""}`} disabled={!canDecide} onClick={() => canDecide && decide(it.idx, key)}>
                    <span className="nm">{canDecide ? <span className={`radio${on ? " on" : ""}`} aria-hidden="true"><span /></span> : null}{lbl}</span>
                    <span className="p"><Parts parts={wordDiff(bt, tx)} /></span>
                  </button>
                );
              };
              const editing = d === "edit";
              return (
                <section key={`x${it.idx}`} className={`rv-conflict${d ? " decided" : ""}`} aria-label={it.label} data-testid="cr-conflict">
                  <div className="rv-hunk-head">
                    <span className="both">{t("rv.bothChanged")}</span>
                    <span className="lbl">{it.label}</span>
                    {it.section ? <span className="sec">{t("rv.in", { section: it.section })}</span> : null}
                  </div>
                  <div className="rv-conflict-body">
                    <span className="explain">
                      {t("rv.explain", { a: v.isLead ? t("rv.youCap") : v.lead, b: v.isAuthor ? t("rv.you") : v.author.first, version: ver(v.base) })}{" "}
                      {canDecide ? t("rv.explainPick") : t("rv.explainWait", { name: v.lead })}
                    </span>
                    <div className="rv-opts" role={canDecide ? "radiogroup" : undefined} aria-label={it.label}>
                      {side(it.ours, "mine", oursLabel)}
                      {side(it.theirs, "theirs", theirsLabel)}
                    </div>
                    {canDecide ? (
                      <div className="rv-edit">
                        <button className="link-green" onClick={() => { if (edits[it.idx] == null) setEdits((e) => ({ ...e, [it.idx]: strip(it.theirs) })); decide(it.idx, "edit"); }}>
                          {editing ? t("rv.editingCombined") : t("rv.writeCombined")}
                        </button>
                        {editing ? <textarea aria-label={t("rv.combinedLabel")} value={edits[it.idx] ?? strip(it.theirs)} onChange={(e) => setEdits((x) => ({ ...x, [it.idx]: e.target.value }))} rows={4} /> : null}
                      </div>
                    ) : null}
                    <span className="orig"><b>{t("rv.original", { version: ver(v.base) })}</b> {bt || t("rv.nothingYet")}</span>
                  </div>
                </section>
              );
            })}
            {!nH ? <div className="rv-empty">{open ? (v.isLead ? t("rv.noChangesYour") : t("rv.noChangesLead", { name: v.lead })) : t("rv.noChanges")}</div> : null}
          </div>
        </article>

        <aside className="view-aside">
          <div className="card rv-aside">
            <span className="eyebrow">{canDecide ? t("rv.yourReview") : t("rv.status")}</span>
            {canDecide ? (
              <div className="rv-lead">
                <div className="rv-progress"><span className="big">{t("rv.progress", { done: decided, n: nH })}</span><span className="sub">{t("rv.breakdown", { a: acc, r: rej })}</span></div>
                <div className="rv-bar"><span style={{ width: nH ? `${Math.round((decided / nH) * 100)}%` : "100%" }} /></div>
                <button className={`btn-primary btn-block${ready ? "" : " soft"}`} disabled={pending} onClick={apply}>{nH ? t("rv.merge") : t("rv.closeRequest")}</button>
                {hunks.some((h) => h.kind === "theirs" && !dec[h.idx!]) ? (
                  <button className="btn-secondary btn-block" onClick={() => setDec((d) => { const n = { ...d }; hunks.forEach((h) => { if (h.kind === "theirs" && !n[h.idx!]) n[h.idx!] = "accept"; }); return n; })}>{t("rv.acceptAll")}</button>
                ) : null}
                <span className="hint">{t("rv.applyHint")}</span>
                <div className="rv-more">
                  <button className="link-green" disabled={pending} onClick={() => act(() => setChangeRequestStatus(v.crId, "returned"))}>{t("rv.sendBack", { name: v.author.first })}</button>
                  <button className="link-red" disabled={pending} onClick={() => act(() => setChangeRequestStatus(v.crId, "closed"))}>{t("rv.closeNoMerge")}</button>
                </div>
              </div>
            ) : null}
            {open && !v.isLead && v.isAuthor ? (
              <div className="rv-author">
                <span>{t("rv.notReviewed", { name: v.lead })}</span>
                <button className="btn-secondary btn-block danger" disabled={pending} onClick={() => act(() => setChangeRequestStatus(v.crId, "withdrawn"))}>{t("rv.withdraw")}</button>
              </div>
            ) : null}
            {v.status === "returned" && v.isAuthor ? <Link href={`/proposals/${v.proposalId}/suggest?cr=${v.crId}`} className="btn-primary btn-block">{t("rv.update")}</Link> : null}
            {stateLine ? <span className="rv-state">{stateLine}</span> : null}
          </div>
          <div className="card rv-how">
            <span className="eyebrow">{t("rv.how")}</span>
            <span>{t("rv.howText", { version: ver(v.base), who })}</span>
          </div>
        </aside>
      </div>
    </main>
  );
}
