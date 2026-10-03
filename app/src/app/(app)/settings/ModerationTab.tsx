"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useToast } from "@/components/Toast";
import { shortAgo } from "@/lib/format";
import { approveComment, removeComment } from "./actions";
import { useI18n } from "@/i18n/client";
import type { MessageKey } from "@/i18n/en";

type Item = {
  id: string;
  proposalId: string;
  proposalTitle: string;
  author: string;
  body: string;
  createdAt: string;
  status: "visible" | "pending" | "flagged";
  flagReason: string | null;
  flagSource: "jev" | "users" | null;
  readerFlags: { reason: string; n: number }[];
};

export function ModerationTab({ items }: { items: Item[] }) {
  const [pending, start] = useTransition();
  const toast = useToast();
  const i18n = useI18n();
  const { t, tn } = i18n;
  const reason = (r: string | null) => (r ? t(`flag.${r}` as MessageKey) : "");
  const act = (fn: (id: string) => Promise<{ ok: boolean; error?: string }>, id: string, done: string) =>
    start(async () => {
      const r = await fn(id);
      toast(r.ok ? done : (r.error ?? t("err.generic")));
    });

  if (!items.length) {
    return (
      <div className="empty">
        <div className="t">{t("mod.nothing")}</div>
        <div className="d">{t("mod.nothingText")}</div>
      </div>
    );
  }

  return (
    <div className="streams-wrap">
      <div className="streams-bar"><span>{tn("mod.waiting", items.length)}</span></div>
      <div className="mod-list">
        {items.map((m) => (
          <div className="mod-item" key={m.id} data-testid="moderation-item">
            <div className="main">
              <div className="mod-tags">
                {m.status === "pending" ? <span className="mod-tag held">{t("mod.held", { reason: reason(m.flagReason) })}</span> : null}
                {m.status === "flagged" ? <span className="mod-tag">{t("mod.hidden", { reason: reason(m.flagReason) })}{m.flagSource === "users" ? " " + t("mod.readers") : ""}</span> : null}
                {m.readerFlags.map((f) => <span key={f.reason} className="mod-tag reader">{t(`reason.${f.reason}` as MessageKey)} × {f.n}</span>)}
              </div>
              <div className="quote">{m.body}</div>
              <div className="meta">
                <span>{m.author}</span><span>·</span><span>{shortAgo(new Date(m.createdAt), i18n)}</span><span>·</span>
                <Link href={`/proposals/${m.proposalId}#cmt-${m.id}`}>{m.proposalTitle}</Link>
              </div>
            </div>
            <div className="acts">
              <button className="btn-secondary" disabled={pending} onClick={() => act(approveComment, m.id, t("mod.approved"))}>{t("mod.approve")}</button>
              <button className="mod-remove" disabled={pending} onClick={() => act(removeComment, m.id, t("mod.removed"))}>{t("mod.remove")}</button>
            </div>
          </div>
        ))}
      </div>
      <p className="small-note">{t("mod.note")}</p>
    </div>
  );
}
