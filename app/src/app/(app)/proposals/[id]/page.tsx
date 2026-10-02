import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getProposalDetail, getStreams } from "@/lib/data";
import { getSettings } from "@/lib/settings";
import { savedAgo, shortDate } from "@/lib/format";
import { formatScore, scaleSuffix } from "@/lib/scale";
import { sortedScores } from "@/lib/proposal-view";
import { BackIcon } from "@/components/icons";
import { Discussion } from "./Discussion";
import { FollowButton } from "./FollowButton";

function paragraphs(body: string) {
  return body
    .split(/\n\s*\n/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => (t.startsWith("## ") ? { h: true, text: t.slice(3) } : { h: false, text: t }));
}

export async function generateMetadata({ params }: PageProps<"/proposals/[id]">) {
  const user = await requireUser();
  const p = await getProposalDetail((await params).id, user);
  const c = p && (p.versions.at(-1) ?? p.draft);
  return { title: c ? `${c.title} · Insight Pitch` : "Proposal · Insight Pitch" };
}

export default async function ProposalPage({ params, searchParams }: PageProps<"/proposals/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requireUser();
  const [p, streams, settings] = await Promise.all([getProposalDetail(id, user), getStreams(), getSettings()]);
  if (!p) notFound();

  const latest = p.versions.at(-1) ?? null;
  const requested = Number(Array.isArray(sp.v) ? sp.v[0] : sp.v);
  const pinned = Number.isInteger(requested) ? p.versions.find((v) => v.number === requested) ?? null : null;
  const shown = pinned ?? latest ?? p.draft!;
  const isOld = Boolean(pinned && latest && pinned.number !== latest.number);
  const mine = p.author.id === user.id;
  const sfx = scaleSuffix(settings.scale);
  const scored = sortedScores(p.scores, streams);
  const unscored = streams.filter((s) => s.active && !p.scores.some((x) => x.streamId === s.id)).map((s) => s.name);
  const allJev = scored.length > 0 && scored.every((s) => s.jevScore != null) && settings.scoredBy !== "author";
  const scoreCaption = allJev
    ? "Extracted from the proposal by Jev"
    : settings.scoredBy === "author" || !latest
      ? "Suggested by the author"
      : "Suggested by the author · awaiting Jev review";
  const commentCount = p.comments.reduce((n, c) => n + 1 + c.replies.length, 0);

  const metaLine = latest
    ? `Published v${latest.number} · ${shortDate(latest.publishedAt)}` + (p.versions.length > 1 ? ` · first published ${shortDate(p.versions[0].publishedAt)}` : "")
    : `Draft · saved ${savedAgo(p.draft!.savedAt)}`;
  const editLabel = p.draft ? "Continue draft" : latest ? "Edit as new version" : "Edit draft";
  const participants = [p.author.name, ...p.comments.flatMap((c) => [c.author.name, ...c.replies.map((r) => r.author.name)])];

  return (
    <main className="view-main" data-screen-label="Proposal">
      <Link href="/" className="back-link"><BackIcon />All proposals</Link>
      <div className="view-cols">
        <article className="view-article">
          {isOld && pinned && latest ? (
            <div className="notice-old">
              <span>You&apos;re viewing <b>v{pinned.number}</b> from {shortDate(pinned.publishedAt)}. {pinned.note}.</span>
              <Link href={`/proposals/${p.id}`} className="btn-link">View latest (v{latest.number}) →</Link>
            </div>
          ) : null}
          {!latest ? <div className="notice-draft">This proposal is a draft. Only you can see it until it&apos;s published.</div> : null}
          <h1 className="view-title">{shown.title}</h1>
          {shown.summary ? <p className="view-summary">{shown.summary}</p> : null}
          <div className="byline">
            <span className="avatar av-38">{p.author.initials}</span>
            <div className="who"><b>{p.author.name}</b><span>{metaLine}</span></div>
          </div>

          <section className="card scores-card" aria-label="Stream scores">
            <div className="head"><span className="eyebrow">Stream scores</span><span className="cap">{scoreCaption}</span></div>
            <div className="score-rows">
              {scored.map((s) => (
                <div className="score-row" key={s.streamId}>
                  <span className="name"><span className="dot" style={{ background: s.stream.color }} />{s.stream.name}</span>
                  <span className="bar"><span style={{ width: `${s.score * 10}%`, background: s.stream.color }} /></span>
                  <span className="val"><b>{formatScore(s.score, settings.scale)}</b><span>{sfx}</span></span>
                </div>
              ))}
              {scored.length === 0 ? <div className="cap">No streams picked yet.</div> : null}
              {unscored.length ? <div className="unscored">Not scored: {unscored.join(", ")}</div> : null}
            </div>
          </section>

          <div className="prose">
            {paragraphs(shown.body).map((pa, i) => (pa.h ? <h3 key={i}>{pa.text}</h3> : <p key={i}>{pa.text}</p>))}
          </div>

          <Discussion
            proposalId={p.id}
            canComment={Boolean(latest)}
            commentCount={commentCount}
            me={{ id: user.id, initials: user.initials }}
            participants={[...new Set(participants)]}
            comments={p.comments.map((c) => ({
              ...c,
              createdAt: c.createdAt.toISOString(),
              replies: c.replies.map((r) => ({ ...r, createdAt: r.createdAt.toISOString(), replies: [] })),
            }))}
          />
        </article>

        <aside className="view-aside">
          <div className="card">
            <div className="status-head">
              <span className="eyebrow">Status</span>
              {latest ? <span className="pill pill-green">Published</span> : <span className="pill pill-amber">Draft</span>}
            </div>
            <div className="status-line">
              {latest ? `${p.versions.length} ${p.versions.length === 1 ? "version" : "versions"} · last published ${shortDate(latest.publishedAt)}` : "Not published yet"}
            </div>
            {mine ? (
              <Link href={`/proposals/${p.id}/edit`} className="btn-primary btn-block">{editLabel}</Link>
            ) : (
              <FollowButton proposalId={p.id} following={p.following} />
            )}
          </div>
          <nav className="card versions-card" aria-label="Version history">
            <div className="eyebrow">Version history</div>
            {mine && p.draft && latest ? (
              <Link href={`/proposals/${p.id}/edit`} className="version-btn pending-draft">
                <span className="vdot" />
                <span className="vtext"><span className="vhead">Unpublished draft</span><span className="vnote">Saved {savedAgo(p.draft.savedAt)} · Continue editing</span></span>
              </Link>
            ) : null}
            {[...p.versions].reverse().map((v) => {
              const isLatest = v === latest;
              return (
                <Link key={v.number} href={isLatest ? `/proposals/${p.id}` : `/proposals/${p.id}?v=${v.number}`} className="version-btn" aria-current={shown === v ? "true" : undefined} scroll={false}>
                  <span className="vdot" />
                  <span className="vtext">
                    <span className="vhead"><b>v{v.number}</b><span className="vdate">{shortDate(v.publishedAt)}</span>{isLatest ? <span className="latest-tag">Latest</span> : null}</span>
                    <span className="vnote">{v.note}</span>
                  </span>
                </Link>
              );
            })}
            {!latest ? <div className="muted-note">Nothing published yet. v1 is created when you publish.</div> : null}
          </nav>
        </aside>
      </div>
    </main>
  );
}
