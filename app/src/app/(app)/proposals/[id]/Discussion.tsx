"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useToast } from "@/components/Toast";
import { HeartIcon } from "@/components/icons";
import { shortAgo } from "@/lib/format";
import { postComment, toggleLike } from "../../actions";

type C = {
  id: string;
  author: { id: string; name: string; initials: string };
  body: string;
  createdAt: string;
  likes: number;
  liked: boolean;
  replies: C[];
};

type Props = {
  proposalId: string;
  canComment: boolean;
  commentCount: number;
  me: { id: string; initials: string };
  participants: string[];
  comments: C[];
};

export function Discussion({ proposalId, canComment, commentCount, me, participants, comments }: Props) {
  const toast = useToast();
  const [pending, start] = useTransition();
  const [newComment, setNewComment] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  // Likes flip instantly; the server copy replaces this once the action revalidates.
  const [view, flipLike] = useOptimistic(comments, (state, id: string) => {
    const flip = (c: C): C => (c.id === id ? { ...c, liked: !c.liked, likes: c.likes + (c.liked ? -1 : 1) } : { ...c, replies: c.replies.map(flip) });
    return state.map(flip);
  });

  const like = (id: string) =>
    start(async () => {
      flipLike(id);
      const r = await toggleLike(id);
      if (!r.ok) toast(r.error);
    });

  const post = () => {
    const text = newComment.trim();
    if (!text) return;
    start(async () => {
      const r = await postComment(proposalId, text);
      if (r.ok) setNewComment("");
      else toast(r.error);
    });
  };

  const submitReply = (parentId: string) => {
    const text = replyText.trim();
    if (!text) return;
    start(async () => {
      const r = await postComment(proposalId, text, parentId);
      if (r.ok) {
        setReplyTo(null);
        setReplyText("");
        setExpanded((e) => ({ ...e, [parentId]: true }));
      } else toast(r.error);
    });
  };

  // "@Daniel Okafor the board said…" renders the name as a mention.
  const splitMention = (text: string) => {
    const m = participants.map((n) => "@" + n).find((n) => text.startsWith(n + " ") || text === n);
    return m ? { mention: m, body: text.slice(m.length).trim() } : { mention: "", body: text };
  };

  const avatarClass = (authorId: string) => (authorId === me.id ? " avatar-me" : "");

  return (
    <section className="discussion" aria-label="Discussion">
      <h2>Discussion <span>{commentCount}</span></h2>
      {!canComment ? <div className="closed">Comments open once the proposal is published.</div> : null}
      {canComment ? (
        <div className="composer">
          <span className="avatar av-38 avatar-me">{me.initials}</span>
          <div className="composer-box">
            <textarea
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="Add to the discussion…"
              aria-label="Add to the discussion"
              rows={2}
              onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) post(); }}
            />
            <div className="actions">
              <button className="post-btn" onClick={post} disabled={!newComment.trim() || pending}>Post comment</button>
            </div>
          </div>
        </div>
      ) : null}
      <div className="comment-list">
        {view.map((c) => {
          const collapsed = c.replies.length > 2 && !expanded[c.id];
          const shownReplies = collapsed ? c.replies.slice(-1) : c.replies;
          const hidden = c.replies.length - shownReplies.length;
          return (
            <div className="thread" key={c.id} data-testid="comment-thread">
              <div className="cmt">
                <span className={`avatar av-38${avatarClass(c.author.id)}`}>{c.author.initials}</span>
                <div className="cmt-body">
                  <div className="bubble"><div className="an">{c.author.name}</div><div className="tx">{c.body}</div></div>
                  <div className="cmt-actions">
                    <span>{shortAgo(new Date(c.createdAt))}</span>
                    {canComment ? (
                      <>
                        <button aria-pressed={c.liked} onClick={() => like(c.id)}>Like</button>
                        <button onClick={() => { setReplyTo(c.id); setReplyText(""); }}>Reply</button>
                      </>
                    ) : null}
                    {c.likes > 0 ? <span className="likes" aria-label={`${c.likes} likes`}><HeartIcon />{c.likes}</span> : null}
                  </div>
                </div>
              </div>
              <div className="replies">
                {hidden > 0 ? (
                  <button className="expand-btn" onClick={() => setExpanded((e) => ({ ...e, [c.id]: true }))}>
                    View {hidden} earlier {hidden === 1 ? "reply" : "replies"}
                  </button>
                ) : null}
                {shownReplies.map((r) => {
                  const { mention, body } = splitMention(r.body);
                  return (
                    <div className="cmt reply" key={r.id}>
                      <span className={`avatar av-30${avatarClass(r.author.id)}`}>{r.author.initials}</span>
                      <div className="cmt-body">
                        <div className="bubble">
                          <div className="an">{r.author.name}</div>
                          <div className="tx">{mention ? <span className="mention">{mention} </span> : null}{body}</div>
                        </div>
                        <div className="cmt-actions">
                          <span>{shortAgo(new Date(r.createdAt))}</span>
                          <button aria-pressed={r.liked} onClick={() => like(r.id)}>Like</button>
                          <button onClick={() => { setReplyTo(c.id); setReplyText(r.author.id === me.id ? "" : `@${r.author.name} `); }}>Reply</button>
                          {r.likes > 0 ? <span className="likes" aria-label={`${r.likes} likes`}><HeartIcon />{r.likes}</span> : null}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {replyTo === c.id ? (
                  <div className="reply-box">
                    <span className="avatar av-30 avatar-me">{me.initials}</span>
                    <input
                      autoFocus
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") { e.preventDefault(); submitReply(c.id); }
                        if (e.key === "Escape") setReplyTo(null);
                      }}
                      placeholder="Write a reply… (Enter to send)"
                      aria-label="Write a reply"
                    />
                    <button className="send" onClick={() => submitReply(c.id)} disabled={pending}>Reply</button>
                    <button className="cancel" onClick={() => { setReplyTo(null); setReplyText(""); }}>Cancel</button>
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
