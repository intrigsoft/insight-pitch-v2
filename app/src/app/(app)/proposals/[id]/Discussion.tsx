"use client";

import { useRouter } from "next/navigation";
import { useEffect, useOptimistic, useRef, useState, useTransition } from "react";
import { useToast } from "@/components/Toast";
import { HeartIcon } from "@/components/icons";
import { shortAgo } from "@/lib/format";
import { flagComment, markAnswered, postComment, toggleLike, voteInsight } from "../../actions";

type C = {
  id: string;
  author: { id: string; name: string; initials: string };
  body: string;
  createdAt: string;
  likes: number;
  liked: boolean;
  status: "visible" | "pending" | "flagged" | "removed";
  flagReason: string | null;
  relevance: number | null;
  myFlag: string | null;
  replies: C[];
};

type Insight = {
  id: string;
  kind: "concern" | "suggestion" | "clarification";
  text: string;
  answered: boolean;
  votes: number;
  voted: boolean;
  sources: { commentId: string; parentId: string | null; firstName: string }[];
};

type Props = {
  proposalId: string;
  canComment: boolean;
  isAuthor: boolean;
  commentCount: number;
  me: { id: string; initials: string };
  participants: string[];
  comments: C[];
  insights: Insight[];
};

type Sort = "relevant" | "newest" | "oldest" | "liked" | "replies";
type Check = { text: string; flag: string | null; offtopic: boolean };
const REASONS = ["Off-topic", "Inappropriate", "Spam", "Misleading"] as const;
const GROUPS = [
  ["concern", "Concerns", "#b07a1f"],
  ["suggestion", "Suggestions", "#2f7680"],
  ["clarification", "Clarifications", "#3b6a8f"],
] as const;

const WarnIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true"><path d="M12 3 2 20h20L12 3z" /><path d="M12 10v4M12 17v.5" /></svg>
);

export function Discussion({ proposalId, canComment, isAuthor, commentCount, me, participants, comments, insights }: Props) {
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [tab, setTab] = useState<"discussion" | "insights">("discussion");
  const [sort, setSort] = useState<Sort>("relevant");
  const [newComment, setNewComment] = useState("");
  const [check, setCheck] = useState<Check | null>(null);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [replyCheck, setReplyCheck] = useState<Check | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [flagMenu, setFlagMenu] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const later = (fn: () => void, ms: number) => timers.current.push(setTimeout(fn, ms));

  // Likes and votes flip instantly; the server copy replaces them once the action revalidates.
  const [view, flipLike] = useOptimistic(comments, (state, id: string) => {
    const flip = (c: C): C => (c.id === id ? { ...c, liked: !c.liked, likes: c.likes + (c.liked ? -1 : 1) } : { ...c, replies: c.replies.map(flip) });
    return state.map(flip);
  });
  const [ins, flipVote] = useOptimistic(insights, (state, id: string) => state.map((i) => (i.id === id ? { ...i, voted: !i.voted, votes: i.votes + (i.voted ? -1 : 1) } : i)));

  const showInsights = tab === "insights" && ins.length > 0;
  const hiddenForMe = (c: C) => (c.status === "flagged" && c.author.id !== me.id ? 1 : 0);
  const sorted = [...view].sort(
    {
      relevant: (a: C, b: C) => hiddenForMe(a) - hiddenForMe(b) || (b.relevance ?? 50) - (a.relevance ?? 50) || b.likes - a.likes,
      newest: (a: C, b: C) => b.createdAt.localeCompare(a.createdAt),
      oldest: (a: C, b: C) => a.createdAt.localeCompare(b.createdAt),
      liked: (a: C, b: C) => b.likes - a.likes || b.createdAt.localeCompare(a.createdAt),
      replies: (a: C, b: C) => b.replies.length - a.replies.length || b.createdAt.localeCompare(a.createdAt),
    }[sort],
  );

  // New insights are built in the background after a comment posts; pick them up a moment later.
  const refreshSoon = () => later(() => router.refresh(), 4000);

  const like = (id: string) =>
    start(async () => {
      flipLike(id);
      const r = await toggleLike(id);
      if (!r.ok) toast(r.error);
    });

  const text = newComment.trim();
  const activeCheck = check && check.text === text ? check : null;
  const post = () => {
    if (!text || pending) return;
    start(async () => {
      const r = await postComment(proposalId, text, undefined, Boolean(activeCheck));
      if ("check" in r) return setCheck({ text, ...r.check });
      if (!r.ok) return toast(r.error);
      setNewComment("");
      setCheck(null);
      toast(r.status === "pending" ? "Submitted for review. Only you can see it for now." : "Comment posted");
      if (r.status === "visible") refreshSoon();
    });
  };

  const rtext = replyText.trim();
  const activeReplyCheck = replyCheck && replyCheck.text === rtext ? replyCheck : null;
  const submitReply = (parentId: string) => {
    if (!rtext || pending) return;
    start(async () => {
      const r = await postComment(proposalId, rtext, parentId, Boolean(activeReplyCheck));
      if ("check" in r) return setReplyCheck({ text: rtext, ...r.check });
      if (!r.ok) return toast(r.error);
      setReplyTo(null);
      setReplyText("");
      setReplyCheck(null);
      setExpanded((e) => ({ ...e, [parentId]: true }));
      if (r.status === "pending") toast("Reply held for moderator review");
      else refreshSoon();
    });
  };

  const flag = (id: string, reason: (typeof REASONS)[number] | null) =>
    start(async () => {
      setFlagMenu(null);
      const r = await flagComment(id, reason);
      toast(r.ok ? (reason ? "Flagged. A moderator will review it." : "Flag removed") : r.error);
    });

  const vote = (id: string) =>
    start(async () => {
      flipVote(id);
      const r = await voteInsight(id);
      if (!r.ok) toast(r.error);
    });

  const mark = (id: string, answered: boolean) =>
    start(async () => {
      const r = await markAnswered(id, answered);
      toast(r.ok ? (answered ? "Marked as answered" : "Marked as unanswered") : r.error);
    });

  // "Raised by Sam" jumps to that comment in the discussion and highlights it.
  const jump = (src: Insight["sources"][number]) => {
    setTab("discussion");
    if (src.parentId) setExpanded((e) => ({ ...e, [src.parentId!]: true }));
    setHighlight(src.commentId);
    later(() => {
      const el = document.getElementById(`cmt-${src.commentId}`);
      if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 120, behavior: "smooth" });
    }, 80);
    later(() => setHighlight(null), 2600);
  };

  // "@Daniel Okafor the board said…" renders the name as a mention.
  const splitMention = (t: string) => {
    const m = participants.map((n) => "@" + n).find((n) => t.startsWith(n + " ") || t === n);
    return m ? { mention: m, body: t.slice(m.length).trim() } : { mention: "", body: t };
  };

  const renderBody = (c: C, isReply: boolean) => {
    const mine = c.author.id === me.id;
    const flagged = c.status === "flagged" || c.status === "pending";
    if (c.status === "flagged" && !mine && !revealed[c.id]) {
      return (
        <div className="hidden-line">
          <span className="lbl"><WarnIcon />Hidden · {c.flagReason}</span>
          Waiting for moderator review.
          <button onClick={() => setRevealed((r) => ({ ...r, [c.id]: true }))}>Show anyway</button>
        </div>
      );
    }
    const note = c.status === "pending" ? "Pending review · only you can see this" : flagged ? `Flagged · ${c.flagReason} · under review` : "";
    const { mention, body } = isReply ? splitMention(c.body) : { mention: "", body: c.body };
    return (
      <div className={`bubble${flagged ? " flagged" : ""}${highlight === c.id ? " highlight" : ""}`}>
        {note ? <div className="flag-note"><WarnIcon />{note}</div> : null}
        <div className="an">{c.author.name}</div>
        <div className="tx">{mention ? <span className="mention">{mention} </span> : null}{body}</div>
      </div>
    );
  };

  const renderActions = (c: C, onReply: () => void) => {
    const mine = c.author.id === me.id;
    const interactive = canComment && c.status !== "pending";
    return (
      <>
        <div className="cmt-actions">
          <span>{shortAgo(new Date(c.createdAt))}</span>
          {interactive ? (
            <>
              <button aria-pressed={c.liked} onClick={() => like(c.id)}>Like</button>
              <button onClick={onReply}>Reply</button>
              {!mine ? (
                <button
                  className={c.myFlag ? "flagged" : undefined}
                  aria-expanded={flagMenu === c.id}
                  onClick={() => (c.myFlag ? flag(c.id, null) : setFlagMenu(flagMenu === c.id ? null : c.id))}
                >
                  {c.myFlag ? "Flagged" : "Flag"}
                </button>
              ) : null}
            </>
          ) : null}
          {c.likes > 0 ? <span className="likes" aria-label={`${c.likes} likes`}><HeartIcon />{c.likes}</span> : null}
        </div>
        {flagMenu === c.id ? (
          <div className="flag-menu" role="group" aria-label="Flag as">
            <span>Flag as</span>
            {REASONS.map((r) => <button key={r} className="reason" onClick={() => flag(c.id, r)}>{r}</button>)}
            <button className="cancel" onClick={() => setFlagMenu(null)}>Cancel</button>
          </div>
        ) : null}
      </>
    );
  };

  return (
    <section className="discussion" aria-label="Discussion">
      <div className="disc-head">
        <div className={`disc-tabs${ins.length ? " has-insights" : ""}`} role="tablist">
          <button role="tab" className="disc-tab" aria-selected={!showInsights} onClick={() => setTab("discussion")}>Discussion <span>{commentCount}</span></button>
          {ins.length ? (
            <button role="tab" className="disc-tab" aria-selected={showInsights} onClick={() => setTab("insights")}>Insights <span>{ins.length}</span></button>
          ) : null}
        </div>
        {!showInsights && view.length > 1 ? (
          <label className="sort">
            Sort
            <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort comments">
              <option value="relevant">Most relevant</option>
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="liked">Most liked</option>
              <option value="replies">Most replies</option>
            </select>
          </label>
        ) : null}
      </div>

      {showInsights ? (
        <div className="insights" role="tabpanel" aria-label="Insights">
          <div className="intro">Points raised in the discussion, grouped by type. Upvote the ones you want the author to address first.</div>
          {GROUPS.map(([kind, label, dot]) => {
            const items = ins.filter((i) => i.kind === kind).sort((a, b) => Number(a.answered) - Number(b.answered) || b.votes - a.votes);
            if (!items.length) return null;
            const nAnswered = items.filter((i) => i.answered).length;
            return (
              <div className="insight-group" key={kind} data-testid={`insights-${kind}`}>
                <div className="ghead">
                  <span className="dot dot-8" style={{ background: dot }} />
                  <span className="eyebrow">{label}</span>
                  <span className="n">{items.length}{nAnswered ? ` · ${nAnswered} answered` : ""}</span>
                </div>
                <div className="insight-list">
                  {items.map((i) => (
                    <div className={`insight${i.answered ? " answered" : ""}`} key={i.id} data-testid="insight">
                      <button className="vote" aria-pressed={i.voted} title="Upvote" aria-label={`Upvote: ${i.votes} votes`} onClick={() => vote(i.id)}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 15 6-6 6 6" /></svg>
                        {i.votes}
                      </button>
                      <div className="body">
                        <div className="txt">{i.text}</div>
                        <div className="meta">
                          {i.answered ? (
                            <span className="answered-tag">
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12 5 5 9-10" /></svg>
                              Answered
                            </span>
                          ) : null}
                          Raised by
                          {i.sources.map((s, si) => (
                            <button key={s.commentId} className="src" onClick={() => jump(s)}>{s.firstName}{si < i.sources.length - 1 ? "," : ""}</button>
                          ))}
                        </div>
                      </div>
                      {isAuthor && kind === "clarification" ? (
                        <button className={`mark-btn${i.answered ? " undo" : ""}`} onClick={() => mark(i.id, !i.answered)}>{i.answered ? "Mark unanswered" : "Mark answered"}</button>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <>
          {!canComment ? <div className="closed">Comments open once the proposal is published.</div> : null}
          {canComment ? (
            <div className="composer">
              <span className="avatar av-38 avatar-me">{me.initials}</span>
              <div className={`composer-box${activeCheck ? (activeCheck.flag ? " warn-flag" : " warn-offtopic") : ""}`}>
                <textarea
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder="Add to the discussion…"
                  aria-label="Add to the discussion"
                  rows={2}
                  onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) post(); }}
                />
                <div className="actions">
                  <span className={`check-line${activeCheck ? (activeCheck.flag ? " flag" : " offtopic") : ""}`} role={activeCheck ? "status" : undefined} aria-live="polite">
                    {activeCheck ? (
                      <>
                        <WarnIcon />
                        {activeCheck.flag
                          ? `Possible ${activeCheck.flag.toLowerCase()}. Edit it, or post it for moderator review.`
                          : "This looks unrelated to the proposal. Edit it, or post anyway."}
                      </>
                    ) : null}
                  </span>
                  <button className="post-btn" onClick={post} disabled={!text || pending}>
                    {pending && !replyTo ? "Checking…" : activeCheck ? (activeCheck.flag ? "Post for review" : "Post anyway") : "Post comment"}
                  </button>
                </div>
              </div>
            </div>
          ) : null}
          <div className="comment-list">
            {sorted.map((c) => {
              const collapsed = c.replies.length > 2 && !expanded[c.id];
              const shownReplies = collapsed ? c.replies.slice(-1) : c.replies;
              const hidden = c.replies.length - shownReplies.length;
              const open = replyTo === c.id;
              return (
                <div className="thread" key={c.id} id={`cmt-${c.id}`} data-testid="comment-thread">
                  <div className="cmt">
                    <span className={`avatar av-38${c.author.id === me.id ? " avatar-me" : ""}`}>{c.author.initials}</span>
                    <div className="cmt-body">
                      {renderBody(c, false)}
                      {renderActions(c, () => { setReplyTo(c.id); setReplyText(""); setReplyCheck(null); })}
                    </div>
                  </div>
                  <div className="replies">
                    {hidden > 0 ? (
                      <button className="expand-btn" onClick={() => setExpanded((e) => ({ ...e, [c.id]: true }))}>
                        View {hidden} earlier {hidden === 1 ? "reply" : "replies"}
                      </button>
                    ) : null}
                    {shownReplies.map((r) => (
                      <div className="cmt reply" key={r.id} id={`cmt-${r.id}`}>
                        <span className={`avatar av-30${r.author.id === me.id ? " avatar-me" : ""}`}>{r.author.initials}</span>
                        <div className="cmt-body">
                          {renderBody(r, true)}
                          {renderActions(r, () => { setReplyTo(c.id); setReplyCheck(null); setReplyText(r.author.id === me.id ? "" : `@${r.author.name} `); })}
                        </div>
                      </div>
                    ))}
                    {open ? (
                      <div className="reply-wrap">
                        <div className="reply-box">
                          <span className="avatar av-30 avatar-me">{me.initials}</span>
                          <input
                            autoFocus
                            className={activeReplyCheck ? "warn" : undefined}
                            value={replyText}
                            onChange={(e) => setReplyText(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") { e.preventDefault(); submitReply(c.id); }
                              if (e.key === "Escape") { setReplyTo(null); setReplyCheck(null); }
                            }}
                            placeholder="Write a reply… (Enter to send)"
                            aria-label="Write a reply"
                          />
                          <button className="send" onClick={() => submitReply(c.id)} disabled={pending}>{activeReplyCheck ? "Post for review" : "Reply"}</button>
                          <button className="cancel" onClick={() => { setReplyTo(null); setReplyText(""); setReplyCheck(null); }}>Cancel</button>
                        </div>
                        {activeReplyCheck?.flag ? (
                          <div className="reply-warn" role="status"><WarnIcon />Possible {activeReplyCheck.flag.toLowerCase()}. Send again to post it for moderator review.</div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
