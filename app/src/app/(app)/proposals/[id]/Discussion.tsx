"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useOptimistic, useRef, useState, useTransition } from "react";
import { useToast } from "@/components/Toast";
import { useTxActivity } from "@/components/TxActivity";
import { Globe } from "@/components/LanguageMenu";
import { HeartIcon } from "@/components/icons";
import { useI18n } from "@/i18n/client";
import type { MessageKey } from "@/i18n/en";
import { shortAgo } from "@/lib/format";
import { translateTexts, type TextTranslation } from "@/app/tx-actions";
import { FIDELITY_MIN } from "@/lib/fidelity";
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
  language: string | null;
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

type Translation = {
  enabled: boolean;
  label: boolean;
  viewLang: string;
  defaultLang: string;
  insightsLang: string;
  languages: { code: string; native: string }[];
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
  translation: Translation;
};

type Sort = "relevant" | "newest" | "oldest" | "liked" | "replies";
type Check = { text: string; flag: string | null; offtopic: boolean };
const REASONS = ["Off-topic", "Inappropriate", "Spam", "Misleading"] as const;
const GROUPS = [
  ["concern", "ins.concerns", "#b07a1f"],
  ["suggestion", "ins.suggestions", "#2f7680"],
  ["clarification", "ins.clarifications", "#3b6a8f"],
] as const;

const WarnIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true"><path d="M12 3 2 20h20L12 3z" /><path d="M12 10v4M12 17v.5" /></svg>
);
const Chevron = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
);

export function Discussion({ proposalId, canComment, isAuthor, commentCount, me, participants, comments, insights, translation }: Props) {
  const toast = useToast();
  const router = useRouter();
  const i18n = useI18n();
  const { t, tn } = i18n;
  const { track } = useTxActivity();
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
  // Translation: the whole discussion into the reading language, or single comments into any enabled language.
  const [translateAll, setTranslateAll] = useState(false);
  const [commentLang, setCommentLang] = useState<Record<string, string>>({});
  const [txMenu, setTxMenu] = useState<string | null>(null);
  const [tx, setTx] = useState<Record<string, Record<string, TextTranslation>>>({});
  const [txBusy, setTxBusy] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const later = (fn: () => void, ms: number) => timers.current.push(setTimeout(fn, ms));

  // Likes and votes flip instantly; the server copy replaces them once the action revalidates.
  const [view, flipLike] = useOptimistic(comments, (state, id: string) => {
    const flip = (c: C): C => (c.id === id ? { ...c, liked: !c.liked, likes: c.likes + (c.liked ? -1 : 1) } : { ...c, replies: c.replies.map(flip) });
    return state.map(flip);
  });
  const [ins, flipVote] = useOptimistic(insights, (state, id: string) => state.map((i) => (i.id === id ? { ...i, voted: !i.voted, votes: i.votes + (i.voted ? -1 : 1) } : i)));

  const { viewLang, defaultLang } = translation;
  const langOf = (c: C) => c.language ?? defaultLang;
  const native = (code: string) => translation.languages.find((l) => l.code === code)?.native ?? code;
  const all = view.flatMap((c) => [c, ...c.replies]);
  const needsTx = (c: C) => langOf(c) !== viewLang;
  const canTranslateAll = translation.enabled && (all.some(needsTx) || (ins.length > 0 && translation.insightsLang !== viewLang));

  // On failure the comments go back to their original text, so nothing is left stuck on "Translating…".
  const requestTx = (lang: string, texts: string[], onFail: () => void) => {
    const missing = [...new Set(texts.filter((x) => x && !tx[lang]?.[x]))];
    if (!missing.length) return;
    setTxBusy((b) => b + 1);
    track(translateTexts(lang, missing))
      .then((r) => {
        setTx((cur) => ({ ...cur, [lang]: { ...cur[lang], ...r.result } }));
        if (!r.ok) {
          toast(t("tx.failedToast"));
          onFail();
        }
      })
      .catch(() => {
        toast(t("tx.failedToast"));
        onFail();
      })
      .finally(() => setTxBusy((b) => b - 1));
  };

  const toggleTranslateAll = () => {
    const next = !translateAll;
    setTranslateAll(next);
    if (next)
      requestTx(viewLang, [...all.filter(needsTx).map((c) => c.body), ...(translation.insightsLang !== viewLang ? ins.map((i) => i.text) : [])], () => setTranslateAll(false));
  };

  const chooseCommentLang = (c: C, code: string) => {
    setTxMenu(null);
    setCommentLang((m) => ({ ...m, [c.id]: code }));
    if (code !== langOf(c))
      requestTx(code, [c.body], () => setCommentLang((m) => {
        const next = { ...m };
        delete next[c.id];
        return next;
      }));
  };

  /** The comment's text in the language it should show in, and whether that's a translation. */
  const shownText = (c: C) => {
    const target = commentLang[c.id] ?? (translateAll ? viewLang : langOf(c));
    if (target === langOf(c)) return { text: c.body, target, translated: false, busy: false, fidelity: null as number | null };
    const hit = tx[target]?.[c.body];
    return { text: hit?.text ?? c.body, target, translated: Boolean(hit && hit.text !== c.body), busy: !hit, fidelity: hit?.fidelity ?? null };
  };
  const insightText = (i: Insight) => (translateAll && translation.insightsLang !== viewLang ? tx[viewLang]?.[i.text]?.text ?? i.text : i.text);

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
  const reasonLabel = (r: string | null) => (r ? t(`flag.${r}` as MessageKey) : "");

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
      toast(r.status === "pending" ? t("disc.heldForReview") : t("disc.posted"));
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
      if (r.status === "pending") toast(t("disc.replyHeld"));
      else refreshSoon();
    });
  };

  const flag = (id: string, reason: (typeof REASONS)[number] | null) =>
    start(async () => {
      setFlagMenu(null);
      const r = await flagComment(id, reason);
      toast(r.ok ? (reason ? t("disc.flaggedToast") : t("disc.flagRemoved")) : r.error);
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
      toast(r.ok ? (answered ? t("ins.markedAnswered") : t("ins.markedUnanswered")) : r.error);
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
  const splitMention = (s: string) => {
    const m = participants.map((n) => "@" + n).find((n) => s.startsWith(n + " ") || s === n);
    return m ? { mention: m, body: s.slice(m.length).trim() } : { mention: "", body: s };
  };

  const renderBody = (c: C, isReply: boolean) => {
    const mine = c.author.id === me.id;
    const flagged = c.status === "flagged" || c.status === "pending";
    if (c.status === "flagged" && !mine && !revealed[c.id]) {
      return (
        <div className="hidden-line">
          <span className="lbl"><WarnIcon />{t("disc.hidden", { reason: reasonLabel(c.flagReason) })}</span>
          {t("disc.waitingReview")}
          <button onClick={() => setRevealed((r) => ({ ...r, [c.id]: true }))}>{t("disc.showAnyway")}</button>
        </div>
      );
    }
    const note = c.status === "pending" ? t("disc.pendingMine") : flagged ? t("disc.flaggedNote", { reason: reasonLabel(c.flagReason) }) : "";
    const s = shownText(c);
    const { mention, body } = isReply ? splitMention(s.text) : { mention: "", body: s.text };
    return (
      <div className={`bubble${flagged ? " flagged" : ""}${highlight === c.id ? " highlight" : ""}`}>
        {note ? <div className="flag-note"><WarnIcon />{note}</div> : null}
        <div className="an"><Link href={`/people/${c.author.id}`} className="name-link">{c.author.name}</Link></div>
        <div className="tx" lang={s.translated ? s.target : langOf(c)}>{mention ? <span className="mention">{mention} </span> : null}{body}</div>
      </div>
    );
  };

  const relevance = (c: C) => {
    if (c.relevance == null || c.status === "pending") return null;
    const level = c.relevance >= 70 ? 3 : c.relevance >= 35 ? 2 : 1;
    const title = t(level === 3 ? "disc.relHigh" : level === 2 ? "disc.relMedium" : "disc.relLow");
    return (
      <span className={`rel${level === 1 ? " low" : ""}`} title={title}>
        <span className="bars" aria-hidden="true">{[1, 2, 3].map((i) => <span key={i} className={i <= level ? "on" : ""} style={{ height: 3 + i * 3 }} />)}</span>
        {t("disc.relevant", { n: c.relevance })}
      </span>
    );
  };

  const renderActions = (c: C, onReply: () => void, isReply: boolean) => {
    const mine = c.author.id === me.id;
    const interactive = canComment && c.status !== "pending";
    const s = shownText(c);
    const translatable = translation.enabled && translation.languages.length > 1 && c.status !== "pending";
    const txLabel = s.target === langOf(c) ? t("view.translate") : s.busy ? t("header.translating") : native(s.target);
    return (
      <>
        <div className="cmt-actions">
          <span>{shortAgo(new Date(c.createdAt), i18n)}</span>
          {s.translated && translation.label && !(c.status === "flagged" && !mine && !revealed[c.id]) ? (
            // The AI accuracy check for this translation; low scores are called out.
            <span
              className={`tx-note${s.fidelity != null && s.fidelity < FIDELITY_MIN ? " low" : ""}`}
              title={s.fidelity != null ? t("tx.accuracyHelp") : undefined}
              data-testid="comment-tx-note"
            >
              {s.fidelity == null
                ? t("disc.translated")
                : t(s.fidelity < FIDELITY_MIN ? "disc.translatedLow" : "disc.translatedScore", { pct: Math.round((s.fidelity / 4) * 100) })}
            </span>
          ) : null}
          {interactive ? (
            <>
              <button aria-pressed={c.liked} onClick={() => like(c.id)}>{t("disc.like")}</button>
              <button onClick={onReply}>{t("disc.reply")}</button>
              {!mine ? (
                <button
                  className={c.myFlag ? "flagged" : undefined}
                  aria-expanded={flagMenu === c.id}
                  onClick={() => (c.myFlag ? flag(c.id, null) : setFlagMenu(flagMenu === c.id ? null : c.id))}
                >
                  {c.myFlag ? t("disc.flagged") : t("disc.flag")}
                </button>
              ) : null}
            </>
          ) : null}
          {translatable ? (
            <span className="cmt-tx">
              <button className={s.target !== langOf(c) ? "on" : undefined} aria-haspopup="menu" aria-expanded={txMenu === c.id} onClick={() => setTxMenu(txMenu === c.id ? null : c.id)}>
                {txLabel}<Chevron />
              </button>
              {txMenu === c.id ? (
                <div className="menu cmt-tx-menu" role="menu">
                  <div className="menu-label">{t("disc.translateTo")}</div>
                  {[langOf(c), ...translation.languages.map((l) => l.code).filter((x) => x !== langOf(c))].map((code) => (
                    <button key={code} role="menuitemradio" aria-checked={code === s.target} className="lang-item small" onClick={() => chooseCommentLang(c, code)}>
                      <span lang={code}>{code === langOf(c) ? t("disc.originalLang", { lang: native(code) }) : native(code)}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </span>
          ) : null}
          {!isReply ? relevance(c) : null}
          {c.likes > 0 ? <span className={`likes${isReply ? " push" : ""}`} aria-label={tn("disc.likes", c.likes)}><HeartIcon />{c.likes}</span> : null}
        </div>
        {flagMenu === c.id ? (
          <div className="flag-menu" role="group" aria-label={t("disc.flagAs")}>
            <span>{t("disc.flagAs")}</span>
            {REASONS.map((r) => <button key={r} className="reason" onClick={() => flag(c.id, r)}>{t(`reason.${r}`)}</button>)}
            <button className="cancel" onClick={() => setFlagMenu(null)}>{t("disc.cancel")}</button>
          </div>
        ) : null}
      </>
    );
  };

  return (
    <section className="discussion" aria-label={t("disc.discussion")}>
      <div className="disc-head">
        <div className={`disc-tabs${ins.length ? " has-insights" : ""}`} role="tablist">
          <button role="tab" className="disc-tab" aria-selected={!showInsights} onClick={() => setTab("discussion")}>{t("disc.discussion")} <span>{commentCount}</span></button>
          {ins.length ? (
            <button role="tab" className="disc-tab" aria-selected={showInsights} onClick={() => setTab("insights")}>{t("disc.insights")} <span>{ins.length}</span></button>
          ) : null}
        </div>
        <div className="disc-tools">
          {canTranslateAll ? (
            <button className={`disc-tx${translateAll ? " on" : ""}`} onClick={toggleTranslateAll}>
              <Globe size={14} />
              {translateAll ? (txBusy ? t("disc.translatingDiscussion") : t("disc.showOriginalComments")) : t("disc.translateDiscussion")}
            </button>
          ) : null}
          {!showInsights && view.length > 1 ? (
            <label className="sort">
              {t("list.sort")}
              <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label={t("disc.sortComments")}>
                <option value="relevant">{t("disc.sortRelevant")}</option>
                <option value="newest">{t("disc.sortNewest")}</option>
                <option value="oldest">{t("disc.sortOldest")}</option>
                <option value="liked">{t("disc.sortLiked")}</option>
                <option value="replies">{t("disc.sortReplies")}</option>
              </select>
            </label>
          ) : null}
        </div>
      </div>

      {showInsights ? (
        <div className="insights" role="tabpanel" aria-label={t("disc.insights")}>
          <div className="intro">{t("ins.intro")}</div>
          {GROUPS.map(([kind, labelKey, dot]) => {
            const items = ins.filter((i) => i.kind === kind).sort((a, b) => Number(a.answered) - Number(b.answered) || b.votes - a.votes);
            if (!items.length) return null;
            const nAnswered = items.filter((i) => i.answered).length;
            return (
              <div className="insight-group" key={kind} data-testid={`insights-${kind}`}>
                <div className="ghead">
                  <span className="dot dot-8" style={{ background: dot }} />
                  <span className="eyebrow">{t(labelKey)}</span>
                  <span className="n">{items.length}{nAnswered ? ` · ${t("ins.answeredCount", { n: nAnswered })}` : ""}</span>
                </div>
                <div className="insight-list">
                  {items.map((i) => (
                    <div className={`insight${i.answered ? " answered" : ""}`} key={i.id} data-testid="insight">
                      <button className="vote" aria-pressed={i.voted} title={t("ins.upvote")} aria-label={t("ins.votes", { n: i.votes })} onClick={() => vote(i.id)}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 15 6-6 6 6" /></svg>
                        {i.votes}
                      </button>
                      <div className="body">
                        <div className="txt">{insightText(i)}</div>
                        <div className="meta">
                          {i.answered ? (
                            <span className="answered-tag">
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12 5 5 9-10" /></svg>
                              {t("ins.answered")}
                            </span>
                          ) : null}
                          {t("ins.raisedBy")}
                          {i.sources.map((s, si) => (
                            <button key={s.commentId} className="src" onClick={() => jump(s)}>{s.firstName}{si < i.sources.length - 1 ? "," : ""}</button>
                          ))}
                        </div>
                      </div>
                      {isAuthor && kind === "clarification" ? (
                        <button className={`mark-btn${i.answered ? " undo" : ""}`} onClick={() => mark(i.id, !i.answered)}>{i.answered ? t("ins.markUnanswered") : t("ins.markAnswered")}</button>
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
          {!canComment ? <div className="closed">{t("disc.closed")}</div> : null}
          {canComment ? (
            <div className="composer">
              <span className="avatar av-38 avatar-me">{me.initials}</span>
              <div className={`composer-box${activeCheck ? (activeCheck.flag ? " warn-flag" : " warn-offtopic") : ""}`}>
                <textarea
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder={t("disc.placeholder")}
                  aria-label={t("disc.placeholder")}
                  rows={2}
                  onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) post(); }}
                />
                <div className="actions">
                  <span className={`check-line${activeCheck ? (activeCheck.flag ? " flag" : " offtopic") : ""}`} role={activeCheck ? "status" : undefined} aria-live="polite">
                    {activeCheck ? (
                      <>
                        <WarnIcon />
                        {activeCheck.flag ? t("disc.warnFlag", { reason: reasonLabel(activeCheck.flag).toLowerCase() }) : t("disc.warnOfftopic")}
                      </>
                    ) : null}
                  </span>
                  <button className="post-btn" onClick={post} disabled={!text || pending}>
                    {pending && !replyTo ? t("disc.checking") : activeCheck ? (activeCheck.flag ? t("disc.postForReview") : t("disc.postAnyway")) : t("disc.post")}
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
                      {renderActions(c, () => { setReplyTo(c.id); setReplyText(""); setReplyCheck(null); }, false)}
                    </div>
                  </div>
                  <div className="replies">
                    {hidden > 0 ? (
                      <button className="expand-btn" onClick={() => setExpanded((e) => ({ ...e, [c.id]: true }))}>{tn("disc.viewEarlier", hidden)}</button>
                    ) : null}
                    {shownReplies.map((r) => (
                      <div className="cmt reply" key={r.id} id={`cmt-${r.id}`}>
                        <span className={`avatar av-30${r.author.id === me.id ? " avatar-me" : ""}`}>{r.author.initials}</span>
                        <div className="cmt-body">
                          {renderBody(r, true)}
                          {renderActions(r, () => { setReplyTo(c.id); setReplyCheck(null); setReplyText(r.author.id === me.id ? "" : `@${r.author.name} `); }, true)}
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
                            placeholder={t("disc.replyPlaceholder")}
                            aria-label={t("disc.writeReply")}
                          />
                          <button className="send" onClick={() => submitReply(c.id)} disabled={pending}>{activeReplyCheck ? t("disc.postForReview") : t("disc.reply")}</button>
                          <button className="cancel" onClick={() => { setReplyTo(null); setReplyText(""); setReplyCheck(null); }}>{t("disc.cancel")}</button>
                        </div>
                        {activeReplyCheck?.flag ? (
                          <div className="reply-warn" role="status"><WarnIcon />{t("disc.replyWarn", { reason: reasonLabel(activeReplyCheck.flag).toLowerCase() })}</div>
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
