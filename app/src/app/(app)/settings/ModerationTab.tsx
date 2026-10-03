"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useToast } from "@/components/Toast";
import { shortAgo } from "@/lib/format";
import { approveComment, removeComment } from "./actions";

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
  const act = (fn: (id: string) => Promise<{ ok: boolean; error?: string }>, id: string, done: string) =>
    start(async () => {
      const r = await fn(id);
      toast(r.ok ? done : (r.error ?? "Something went wrong."));
    });

  if (!items.length) {
    return (
      <div className="empty">
        <div className="t">Nothing to review</div>
        <div className="d">Comments held by the automatic check or flagged by readers show up here.</div>
      </div>
    );
  }

  return (
    <div className="streams-wrap">
      <div className="streams-bar"><span>{items.length} {items.length === 1 ? "comment" : "comments"} waiting for review</span></div>
      <div className="mod-list">
        {items.map((m) => (
          <div className="mod-item" key={m.id} data-testid="moderation-item">
            <div className="main">
              <div className="mod-tags">
                {m.status === "pending" ? <span className="mod-tag held">Held before posting · {m.flagReason}</span> : null}
                {m.status === "flagged" ? <span className="mod-tag">Hidden · {m.flagReason}{m.flagSource === "users" ? " (readers)" : ""}</span> : null}
                {m.readerFlags.map((f) => <span key={f.reason} className="mod-tag reader">{f.reason} × {f.n}</span>)}
              </div>
              <div className="quote">{m.body}</div>
              <div className="meta">
                <span>{m.author}</span><span>·</span><span>{shortAgo(new Date(m.createdAt))}</span><span>·</span>
                <Link href={`/proposals/${m.proposalId}#cmt-${m.id}`}>{m.proposalTitle}</Link>
              </div>
            </div>
            <div className="acts">
              <button className="btn-secondary" disabled={pending} onClick={() => act(approveComment, m.id, "Comment approved")}>Approve</button>
              <button className="mod-remove" disabled={pending} onClick={() => act(removeComment, m.id, "Comment removed")}>Remove</button>
            </div>
          </div>
        ))}
      </div>
      <p className="small-note">Approving publishes the comment and stops reader flags from hiding it again. Removing takes it down for everyone.</p>
    </div>
  );
}
