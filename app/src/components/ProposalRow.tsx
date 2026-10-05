import Link from "next/link";
import type { ProposalSummary, Stream } from "@/lib/data";
import type { AppSettings } from "@/lib/settings";
import { formatScore } from "@/lib/scale";
import { sortedScores } from "@/lib/proposal-view";
import { timeAgo } from "@/lib/format";
import type { getI18n } from "@/i18n/server";
import { CommentIcon } from "./icons";
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
            <span>·</span>
          </>
        ) : null}
        <span>{t("list.updated", { when: timeAgo(p.updatedAt, i18n) })}</span>
        <span>·</span><span>{p.latest ? `v${p.latest.number}` : t("list.notPublished")}</span>
        {shown.translated && settings.txLabel ? (<><span>·</span><span className="tx-tag"><Globe size={13} />{t("list.translated")}</span></>) : null}
        <span className="comment-count" aria-label={tn("list.comments", p.commentCount)}><CommentIcon />{p.commentCount}</span>
      </div>
    </div>
  );
}
