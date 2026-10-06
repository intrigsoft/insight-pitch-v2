import Link from "next/link";
import type { ProposalSummary, Stream } from "@/lib/data";
import type { AppSettings } from "@/lib/settings";
import { formatScore } from "@/lib/scale";
import { sortedScores } from "@/lib/proposal-view";
import { timeAgo } from "@/lib/format";
import { tally } from "@/lib/vote-tally";
import type { getI18n } from "@/i18n/server";
import { CheckIcon, CommentIcon } from "./icons";
import { Globe } from "./LanguageMenu";

type I18n = Awaited<ReturnType<typeof getI18n>>;

/** One proposal in a list. The whole row opens the proposal; the author's name opens their profile. */
export function ProposalRow({ p, shown, isMine, streams, streamName, settings, i18n, showAuthor = true }: {
  p: ProposalSummary;
  shown: { title: string; summary: string; translated: boolean };
  isMine: boolean;
  streams: Stream[];
  streamName: (s: Stream) => string;
  settings: AppSettings;
  i18n: I18n;
  showAuthor?: boolean;
}) {
  const { t, tn } = i18n;
  const isDraft = !p.latest;
  const hasPending = Boolean(p.latest && p.draft && isMine);
  const vt = p.latest ? tally(p.votes.support, p.votes.oppose, p.votes.min, { pct: settings.mandatePct, votes: settings.mandateVotes }) : null;
  const voteCount = vt ? tn("md.votes", vt.total) : "";
  return (
    <div className="row">
      {isDraft || hasPending ? (
        <div className="badges">
          {isDraft ? <span className="pill pill-amber">{t("list.draft")}</span> : null}
          {hasPending ? <span className="pill pill-amber">{t("list.unpublishedChanges")}</span> : null}
        </div>
      ) : null}
      <h2><Link href={`/proposals/${p.id}`} className="row-link">{shown.title}</Link></h2>
      {shown.summary ? <p>{shown.summary}</p> : null}
      {p.scores.length ? (
        <div className="score-chips">
          {sortedScores(p.scores, streams).map((s) => (
            <span key={s.streamId} className="score-chip">
              <span className="dot dot-8" style={{ background: s.stream.color }} />
              {streamName(s.stream)}
              {settings.showPublic ? <b>{formatScore(s.score, settings.scale)}</b> : null}
            </span>
          ))}
        </div>
      ) : null}
      <div className="row-meta">
        {showAuthor ? (
          <>
            <span className="avatar av-24">{p.author.initials}</span>
            <Link href={`/people/${p.author.id}`} className="author author-link">{p.author.name}</Link>
            {p.teamSize > 1 ? <span className="team-more">{tn("list.andOthers", p.teamSize - 1)}</span> : null}
            <span>·</span>
          </>
        ) : null}
        <span>{t("list.updated", { when: timeAgo(p.updatedAt, i18n) })}</span>
        <span>·</span><span>{p.latest ? `v${p.latest.number}` : t("list.notPublished")}</span>
        {shown.translated && settings.txLabel ? (<><span>·</span><span className="tx-tag"><Globe size={13} />{t("list.translated")}</span></>) : null}
        <span className="row-spacer" />
        {vt?.mandate ? <span className="mandate-pill"><CheckIcon size={12} width={2.6} />{t("md.mandate")}</span> : null}
        {vt?.shown ? (
          <span className="row-support" title={t("md.shareTitle")}>
            <span className="support-bar"><span style={{ width: `${vt.pct}%` }} /></span>
            <span>{t("md.rowSupport", { pct: `${vt.pct}%`, votes: voteCount }).split(`${vt.pct}%`).flatMap((x, i) => (i ? [<b key={i}>{vt.pct}%</b>, x] : [x]))}</span>
          </span>
        ) : vt ? <span>{voteCount}</span> : null}
        <span className="comment-count" aria-label={tn("list.comments", p.commentCount)}><CommentIcon />{p.commentCount}</span>
      </div>
    </div>
  );
}
