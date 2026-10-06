"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useToast } from "@/components/Toast";
import { useI18n } from "@/i18n/client";
import * as A from "../../team-actions";
import type { TeamCardView } from "./team-view";

type Res = { ok: true; message?: string } | { ok: false; error: string };

/** Runs a team action, then shows its message and refreshes the page. Returns the error, if any. */
function useAct() {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<Res>, onError?: (e: string) => void, onOk?: () => void) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) {
        if (onError) onError(r.error);
        else toast(r.error);
        return;
      }
      if (r.message) toast(r.message);
      onOk?.();
      router.refresh();
    });
  return { run, pending };
}

/** "Maya Chen offered you…" with the name in bold. */
function Bold({ text, name }: { text: string; name: string }) {
  const i = text.indexOf(name);
  if (i < 0) return <>{text}</>;
  return <>{text.slice(0, i)}<b>{name}</b>{text.slice(i + name.length)}</>;
}

export function TeamCard({ v }: { v: TeamCardView }) {
  const { t } = useI18n();
  const { run, pending } = useAct();
  const [askOpen, setAskOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const pid = v.proposalId;
  return (
    <>
      <section className="card team-card" aria-label={t("tm.title")}>
        <div className="row-head"><span className="eyebrow">{t("tm.title")}</span><span className="sub">{v.countLabel}</span></div>
        {v.offer ? (
          <div className="team-callout" data-testid="lead-offer">
            <div className="line"><Bold text={t("tm.offerLine", { name: v.offer.from })} name={v.offer.from} /></div>
            {v.offer.note ? <div className="quote">“{v.offer.note}”</div> : null}
            <div className="hint">{v.offer.hint}</div>
            <div className="acts">
              <button className="btn-sm-primary" disabled={pending} onClick={() => run(() => A.acceptOffer(pid))}>{t("tm.accept")}</button>
              <button className="btn-sm" disabled={pending} onClick={() => run(() => A.declineOffer(pid))}>{t("tm.decline")}</button>
            </div>
          </div>
        ) : null}
        {v.invite ? (
          <div className="team-callout" data-testid="team-invite">
            <div className="line"><Bold text={v.invite.line} name={v.invite.from} /></div>
            {v.invite.note ? <div className="quote">“{v.invite.note}”</div> : null}
            <div className="acts">
              <button className="btn-sm-primary" disabled={pending} onClick={() => run(() => A.acceptInvite(pid))}>{t("tm.joinTeam")}</button>
              <button className="btn-sm" disabled={pending} onClick={() => run(() => A.declineInvite(pid))}>{t("tm.decline")}</button>
            </div>
          </div>
        ) : null}
        <ul className="team-members">
          {v.members.map((m) => (
            <li key={m.id}>
              <span className={`avatar av-32${m.isMe ? " avatar-me" : ""}`}>{m.initials}</span>
              <span className="who"><Link href={`/people/${m.id}`} className="name-link">{m.name}</Link><span className="sub">{m.sub}</span></span>
              {m.isLead ? <span className="lead-tag">{t("tm.lead")}</span> : null}
            </li>
          ))}
        </ul>
        {v.openRoles.length ? (
          <div className="team-roles">
            <span className="ttl">{t("tm.lookingFor")}</span>
            {v.openRoles.map((r) => (
              <div className="role" key={r.id}>
                <span className="dot dot-8" style={{ background: r.color }} />
                <span className="txt"><b>{r.name}</b>{r.note ? <span>{r.note}</span> : null}</span>
              </div>
            ))}
          </div>
        ) : null}
        {v.isLead ? (
          <button className="btn-secondary btn-block team-manage" onClick={() => setDrawerOpen(true)}>
            {t("tm.manage")}
            {v.reqBadge ? <span className="req-badge" aria-label={t("tmd.pending", { n: v.reqBadge })}>{v.reqBadge}</span> : null}
          </button>
        ) : null}
        {v.join?.kind === "ask" ? <button className="btn-outline-green btn-block" onClick={() => setAskOpen(true)}>{t("tm.ask")}</button> : null}
        {v.join?.kind === "pending" ? (
          <div className="team-pending">
            <span>{v.join.line}</span>
            <button className="link-red" disabled={pending} onClick={() => run(() => A.withdrawRequest(pid))}>{t("tm.withdraw")}</button>
          </div>
        ) : null}
        {v.join?.kind === "info" ? <div className="team-info">{v.join.text}</div> : null}
        {v.isContrib ? <button className="link-red team-leave" disabled={pending} onClick={() => run(() => A.leaveTeam(pid))}>{t("tm.leave")}</button> : null}
      </section>
      {/* Portalled out of the sticky sidebar, which would otherwise keep them under the page header. */}
      {askOpen && v.ask ? createPortal(<AskDialog pid={pid} ask={v.ask} onClose={() => setAskOpen(false)} />, document.body) : null}
      {drawerOpen && v.drawer ? createPortal(<ManageTeam pid={pid} d={v.drawer} onClose={() => setDrawerOpen(false)} />, document.body) : null}
    </>
  );
}

function useEscape(onClose: () => void) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onClose]);
}

function Radio({ on }: { on: boolean }) {
  return <span className={`radio${on ? " on" : ""}`} aria-hidden="true"><span /></span>;
}

function AskDialog({ pid, ask, onClose }: { pid: string; ask: NonNullable<TeamCardView["ask"]>; onClose: () => void }) {
  const { t } = useI18n();
  const { run, pending } = useAct();
  const [stream, setStream] = useState(ask.defaultStream);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const n = note.length;
  const ready = note.trim().length >= ask.noteMin;
  useEscape(onClose);
  return (
    <>
      <div className="dlg-scrim" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label={t("tm.ask")} className="save-dlg ask-dlg">
        <div className="dlg-head">
          <span className="eyebrow">{t("aj.kicker")}</span>
          <h2 className="ask-title">{ask.title}</h2>
          <p className="intro">{ask.intro}</p>
        </div>
        <div className="dlg-body">
          {ask.roles.length ? (
            <div className="stack" role="radiogroup" aria-label={t("aj.role")}>
              <span className="lbl">{t("aj.role")}</span>
              {ask.roles.map((o) => (
                <button key={o.streamId || "general"} type="button" role="radio" aria-checked={stream === o.streamId} className={`opt${stream === o.streamId ? " on" : ""}`} onClick={() => { setStream(o.streamId); setError(""); }}>
                  <Radio on={stream === o.streamId} />
                  <span className="opt-text"><span className="opt-name"><span className="dot dot-8" style={{ background: o.color }} />{o.name}</span>{o.note ? <span className="opt-desc">{o.note}</span> : null}</span>
                  {o.strength ? <span className="opt-strength">{o.strength}</span> : null}
                </button>
              ))}
            </div>
          ) : null}
          <label className="stack">
            <span className="lbl-row"><span className="lbl">{t("aj.bring")}</span><span className={`count${n > ask.noteMax ? " over" : ""}`}>{n}/{ask.noteMax}</span></span>
            <textarea value={note} onChange={(e) => { setNote(e.target.value); setError(""); }} rows={3} placeholder={t("aj.placeholder")} />
          </label>
          {error ? <div className="dlg-error" role="alert">{error}</div> : null}
          <span className="hint">{ask.footnote}</span>
        </div>
        <div className="dlg-foot">
          <button className="btn-secondary" onClick={onClose}>{t("tmd.cancel")}</button>
          <button className={`btn-primary${ready ? "" : " soft"}`} disabled={pending} onClick={() => run(() => A.askToJoin(pid, stream || null, note), setError, onClose)}>{t("aj.send")}</button>
        </div>
      </div>
    </>
  );
}

function ManageTeam({ pid, d, onClose }: { pid: string; d: NonNullable<TeamCardView["drawer"]>; onClose: () => void }) {
  const { t } = useI18n();
  const { run, pending } = useAct();
  const [confirm, setConfirm] = useState<string | null>(null);
  const [inv, setInv] = useState({ user: "", stream: "", note: "" });
  const [invError, setInvError] = useState("");
  const [role, setRole] = useState({ stream: "", note: "" });
  const [roleError, setRoleError] = useState("");
  useEscape(onClose);
  const modes = (["open", "roles", "closed"] as const).map((k) => ({ k, title: t(`tmd.mode.${k}`), desc: t(`tmd.mode.${k}Desc`) }));
  return (
    <>
      <button className="scrim" aria-label={t("tmd.close")} onClick={onClose} />
      <div role="dialog" aria-label={t("tmd.kicker")} className="drawer team-drawer">
        <div className="drawer-head">
          <div className="titles"><span className="eyebrow">{t("tmd.kicker")}</span><h2>{d.title}</h2></div>
          <button className="drawer-close" aria-label={t("tmd.close")} onClick={onClose}>×</button>
        </div>
        <div className="drawer-body team-drawer-body">
          <section className="tsec" aria-label={t("tmd.requests")}>
            <div className="tsec-head"><h3>{t("tmd.requests")}</h3>{d.requests.length ? <span>{t("tmd.pending", { n: d.requests.length })}</span> : null}</div>
            {d.isDraft ? <p className="tnote">{t("tmd.draftNote")}</p> : null}
            {d.requests.map((r) => (
              <div className="req" key={r.id} data-testid="join-request">
                <div className="req-who">
                  <span className="avatar av-34">{r.initials}</span>
                  <span className="who">
                    <span className="nm"><Link href={`/people/${r.userId}`} className="name-link">{r.name}</Link><span className={`role-pill sm ${r.role}`}>{r.roleLabel}</span></span>
                    <span className="sub">{r.time}</span>
                  </span>
                </div>
                {r.stream ? <div className="req-stream"><span className="chip"><span className="dot" style={{ background: r.stream.color }} />{r.stream.name}</span><span>{r.strengthLine}</span></div> : null}
                <p className="req-note">{r.note}</p>
                <div className="acts">
                  <button className="btn-sm-primary" disabled={pending} onClick={() => run(() => A.approveRequest(pid, r.id))}>{t("tmd.approve")}</button>
                  <button className="btn-sm" disabled={pending} onClick={() => run(() => A.declineRequest(pid, r.id))}>{t("tm.decline")}</button>
                  <span className="grow" />
                  <button className="link-red" title={t("tmd.blockTitle")} disabled={pending} onClick={() => run(() => A.blockRequest(pid, r.id))}>{t("tmd.block")}</button>
                </div>
              </div>
            ))}
            {!d.requests.length && !d.isDraft ? <span className="tnone">{t("tmd.noRequests")}</span> : null}
          </section>

          <section className="tsec" aria-label={t("tmd.members")}>
            <div className="tsec-head"><h3>{t("tmd.members")}</h3><span>{d.memberCount}</span></div>
            <div className="tmembers">
              {d.members.map((m) => (
                <div className="tmember" key={m.id}>
                  <div className="tm-row">
                    <span className={`avatar av-32${m.isMe ? " avatar-me" : ""}`}>{m.initials}</span>
                    <span className="who"><b>{m.name}</b><span className="sub">{m.sub}</span></span>
                    {m.isLead ? <span className="lead-tag">{t("tm.lead")}</span> : null}
                    {!m.isLead && !m.offered && confirm !== m.id ? (
                      <span className="links">
                        <button className="link-green" onClick={() => setConfirm(m.id)}>{t("tmd.makeLead")}</button>
                        <button className="link-red" disabled={pending} onClick={() => run(() => A.removeMember(pid, m.id))}>{t("tmd.remove")}</button>
                      </span>
                    ) : null}
                    {m.offered ? (
                      <span className="links"><span className="pill pill-amber">{t("tmd.offered")}</span><button className="link-muted" disabled={pending} onClick={() => run(() => A.withdrawOffer(pid))}>{t("tm.withdraw")}</button></span>
                    ) : null}
                  </div>
                  {confirm === m.id ? (
                    <div className="confirm">
                      <span>{t("tmd.offerConfirm", { name: m.firstName })}</span>
                      <div className="acts">
                        <button className="btn-sm-primary" disabled={pending} onClick={() => run(() => A.offerLead(pid, m.id), undefined, () => setConfirm(null))}>{t("tmd.offerButton")}</button>
                        <button className="btn-sm" onClick={() => setConfirm(null)}>{t("tmd.cancel")}</button>
                      </div>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </section>

          <section className="tsec" aria-label={t("tmd.invite")}>
            <h3>{t("tmd.invite")}</h3>
            <div className="tgrid">
              <select className="field" aria-label={t("tmd.person")} value={inv.user} onChange={(e) => { setInv({ ...inv, user: e.target.value }); setInvError(""); }}>
                <option value="">{t("tmd.choosePerson")}</option>
                {d.people.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
              <select className="field" aria-label={t("tmd.area")} value={inv.stream} onChange={(e) => setInv({ ...inv, stream: e.target.value })}>
                <option value="">{t("tmd.anyArea")}</option>
                {d.streamOpts.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
            </div>
            <input className="field" value={inv.note} onChange={(e) => setInv({ ...inv, note: e.target.value })} placeholder={t("tmd.inviteNote")} aria-label={t("tmd.inviteNote")} />
            <div className="tsend">
              {invError ? <span className="err" role="alert">{invError}</span> : null}
              <span className="grow" />
              <button className={`btn-sm-primary${inv.user ? "" : " soft"}`} disabled={pending} onClick={() => run(() => A.sendInvite(pid, inv.user, inv.stream || null, inv.note), setInvError, () => setInv({ user: "", stream: "", note: "" }))}>{t("tmd.sendInvite")}</button>
            </div>
            {d.suggest.length ? (
              <div className="tlist">
                <span className="ttl">{t("tmd.suggested")}</span>
                {d.suggest.map((s) => (
                  <div className="titem" key={s.userId}>
                    <span className="avatar av-28">{s.initials}</span>
                    <span className="who"><b>{s.name}</b><span className="sub">{s.line}</span></span>
                    <button className="btn-sm" disabled={pending} onClick={() => run(() => A.sendInvite(pid, s.userId, s.streamId, ""))}>{t("tmd.inviteBtn")}</button>
                  </div>
                ))}
              </div>
            ) : null}
            {d.invites.length ? (
              <div className="tlist">
                <span className="ttl">{t("tmd.pendingInvites")}</span>
                {d.invites.map((i) => (
                  <div className="titem" key={i.id}>
                    <span className="grow"><b>{i.name}</b> <span className="sub">· {i.meta}</span></span>
                    <button className="link-muted" disabled={pending} onClick={() => run(() => A.withdrawInvite(pid, i.id))}>{t("tm.withdraw")}</button>
                  </div>
                ))}
              </div>
            ) : null}
          </section>

          <section className="tsec" aria-label={t("tmd.roles")}>
            <div className="tsec-title"><h3>{t("tmd.roles")}</h3><span>{t("tmd.rolesHint")}</span></div>
            {d.roles.map((o) => (
              <div className="trole" key={o.id}>
                <span className="dot dot-8" style={{ background: o.color }} />
                <span className="txt"><b>{o.name}</b><span>{o.note || t("tmd.noDescription")}</span></span>
                <button className="x" title={t("tmd.removeRole")} aria-label={t("tmd.removeRole")} disabled={pending} onClick={() => run(() => A.removeRole(pid, o.id))}>×</button>
              </div>
            ))}
            <div className="trole-add">
              <select className="field" aria-label={t("tmd.stream")} value={role.stream} onChange={(e) => { setRole({ ...role, stream: e.target.value }); setRoleError(""); }}>
                <option value="">{t("tmd.streamPick")}</option>
                {d.roleOpts.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
              <input className="field" value={role.note} onChange={(e) => setRole({ ...role, note: e.target.value })} placeholder={t("tmd.roleNote")} aria-label={t("tmd.roleNote")} />
              <button className="btn-sm sq" disabled={pending} onClick={() => run(() => A.addRole(pid, role.stream, role.note), setRoleError, () => setRole({ stream: "", note: "" }))}>{t("tmd.add")}</button>
            </div>
            {roleError ? <span className="err" role="alert">{roleError}</span> : null}
          </section>

          <section className="tsec" aria-label={t("tmd.whoCanAsk")}>
            <h3>{t("tmd.whoCanAsk")}</h3>
            <div className="stack" role="radiogroup" aria-label={t("tmd.whoCanAsk")}>
              {modes.map((o) => (
                <button key={o.k} type="button" role="radio" aria-checked={d.mode === o.k} className={`opt${d.mode === o.k ? " on" : ""}`} disabled={pending} onClick={() => run(() => A.setJoinRules(pid, { mode: o.k }))}>
                  <Radio on={d.mode === o.k} />
                  <span className="opt-text"><span className="opt-name">{o.title}</span><span className="opt-desc">{o.desc}</span></span>
                </button>
              ))}
            </div>
            <div className="drawer-row">
              <div className="stack-2"><b>{t("tmd.cap")}</b><span>{t("tmd.capHint")}</span></div>
              <select className="field cap" aria-label={t("tmd.cap")} value={d.cap ? String(d.cap) : ""} disabled={pending} onChange={(e) => run(() => A.setJoinRules(pid, { cap: e.target.value ? Number(e.target.value) : null }))}>
                <option value="">{t("tmd.noLimit")}</option>
                {d.capOptions.map((c) => <option key={c} value={c}>{t("tmd.capN", { n: c })}</option>)}
              </select>
            </div>
            <div className="trules">{t("tmd.rules")}</div>
            {d.blocked.length ? (
              <div className="tblocked">
                <span className="ttl">{t("tmd.blocked")}</span>
                <div className="chips">{d.blocked.map((b) => <span key={b.id} className="bchip">{b.name}<button className="link-green" disabled={pending} onClick={() => run(() => A.unblock(pid, b.id))}>{t("tmd.unblock")}</button></span>)}</div>
              </div>
            ) : null}
          </section>
        </div>
      </div>
    </>
  );
}
