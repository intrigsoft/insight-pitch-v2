import Link from "next/link";
import { notFound } from "next/navigation";
import { after } from "next/server";
import { scoreInsightsSoon } from "@/lib/insight-relevance";
import { requireUser } from "@/lib/auth";
import { getProposalDetail, getStreams } from "@/lib/data";
import { getSettings } from "@/lib/settings";
import { savedAgo, shortDate } from "@/lib/format";
import { formatScore, scaleSuffix } from "@/lib/scale";
import { sortedScores } from "@/lib/proposal-view";
import { contentTranslator } from "@/lib/content-tx";
import { bodyTexts, changesOf, parseBody, TEXT_ONLY_COOKIE } from "@/lib/body";
import { changeLabel } from "@/lib/change-label";
import { versionCredit } from "@/lib/credit";
import { cookies } from "next/headers";
import { ProposalBody } from "@/components/ProposalBody";
import { TextOnlyButton, TextOnlyProvider } from "./Media";
import { FIDELITY_MIN } from "@/lib/fidelity";
import { getI18n, getLanguages } from "@/i18n/server";
import { BackIcon } from "@/components/icons";
import { TranslateMissing } from "@/components/TranslateMissing";
import { Discussion } from "./Discussion";
import { FollowButton } from "./FollowButton";
import { ProposalLangMenu } from "./ProposalLangMenu";
import { TranslationBanner, type BannerProps } from "./TranslationBanner";
import { TeamCard } from "./Team";
import { buildChangeRequests, buildTeamView } from "./team-view";

export async function generateMetadata({ params }: PageProps<"/proposals/[id]">) {
  const user = await requireUser();
  const p = await getProposalDetail((await params).id, user);
  const c = p && (p.versions.at(-1) ?? p.draft);
  return { title: c ? `${c.title} · Insight Pitch` : "Insight Pitch" };
}

export default async function ProposalPage({ params, searchParams }: PageProps<"/proposals/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k][0] : sp[k]);
  const user = await requireUser();
  const [p, streams, settings, i18n, allLangs] = await Promise.all([getProposalDetail(id, user), getStreams(), getSettings(), getI18n(), getLanguages()]);
  if (!p) notFound();
  // Insights from before relevance scoring, or from an earlier version, are judged in the background.
  if (p.insightsStale) after(() => scoreInsightsSoon(p.id));
  const { t, tn, lang: readerLang, locale } = i18n;

  const latest = p.versions.at(-1) ?? null;
  const requested = Number(one("v"));
  const pinned = Number.isInteger(requested) ? p.versions.find((v) => v.number === requested) ?? null : null;
  const shown = pinned ?? latest ?? p.draft!;
  const isOld = Boolean(pinned && latest && pinned.number !== latest.number);
  const mine = p.role === "lead";
  const contrib = p.role === "member";
  const sfx = scaleSuffix(settings.scale);

  // Reading language: the per-proposal choice (?lang=) if it's enabled, else the reader's language.
  const enabled = allLangs.filter((l) => l.enabled);
  const srcLang = ("language" in shown && shown.language) || settings.defaultLanguage;
  const viewLang = enabled.some((l) => l.code === one("lang")) ? one("lang")! : readerLang;
  const showOriginal = one("original") === "1";
  const translating = Boolean(latest) && viewLang !== srcLang && !showOriginal;

  const proposalTexts = [shown.title, shown.summary, ...bodyTexts(shown.body)].filter(Boolean);
  const hasImages = parseBody(shown.body).some((b) => b.type === "image");
  const textOnly = (await cookies()).get(TEXT_ONLY_COOKIE)?.value === "1";
  const tx = await contentTranslator(viewLang, settings.defaultLanguage, [
    ...(latest && viewLang !== srcLang ? proposalTexts.map((text) => ({ text, lang: srcLang })) : []),
    ...(latest ? p.versions.map((v) => ({ text: v.note, lang: v.language })) : []),
    ...streams.map((s) => ({ text: s.name, lang: settings.defaultLanguage })),
  ]);
  const T = (text: string) => (translating ? tx.get(text, srcLang).text : text);
  const streamName = (s: { name: string }) => tx.get(s.name, settings.defaultLanguage).text;

  const scored = sortedScores(p.scores, streams);
  const unscored = streams.filter((s) => s.active && !p.scores.some((x) => x.streamId === s.id)).map(streamName);
  const scoreCaption = t("view.scoresDetected");
  const commentCount = p.comments.reduce((n, c) => n + 1 + c.replies.length, 0);

  const metaLine = latest
    ? t("view.metaPublished", { version: `v${latest.number}`, date: shortDate(latest.publishedAt, locale) }) +
      (p.versions.length > 1 ? " · " + t("view.metaFirst", { date: shortDate(p.versions[0].publishedAt, locale) }) : "")
    : t("view.metaDraft", { when: savedAgo(p.draft!.savedAt, i18n) });
  const editLabel = p.draft ? t("view.continueDraft") : latest ? t("view.editNewVersion") : t("view.editDraft");
  const [team, crs] = await Promise.all([buildTeamView(p, user, streams, settings.scale, i18n, streamName), buildChangeRequests(p, user, i18n)]);
  const participants = [...team.members.map((m) => m.name.replace(/ \(.*\)$/, "")), ...p.comments.flatMap((c) => [c.author.name, ...c.replies.map((r) => r.author.name)])];

  // Translation banner, worked out here and rendered by a client component that also handles failure and retry.
  const langName = (code: string) => allLangs.find((l) => l.code === code)?.native ?? code;
  const query = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams();
    const cur: Record<string, string | null> = { v: pinned ? String(pinned.number) : null, lang: one("lang") ?? null, original: showOriginal ? "1" : null };
    for (const [k, v] of Object.entries({ ...cur, ...patch })) if (v) next.set(k, v);
    const s = next.toString();
    return s ? `/proposals/${p.id}?${s}` : `/proposals/${p.id}`;
  };
  let banner: BannerProps | null = null;
  if (latest && viewLang !== srcLang) {
    const from = langName(srcLang), to = langName(viewLang);
    const parts = proposalTexts.map((text) => tx.get(text, srcLang));
    const total = parts.length, done = parts.filter((x) => x.cached).length, ready = done === total;
    const fresh = parts.filter((x) => x.fresh).length;
    const reviewed = parts.filter((x) => x.reviewed).length;
    const needsCheck = parts.filter((x) => x.needsCheck).length;
    const scores = parts.map((x) => x.fidelity).filter((f): f is number => f != null);
    const pct = (f: number) => Math.round((f / 4) * 100);
    const accuracy = scores.length
      ? t("tx.accuracy", { pct: pct(scores.reduce((a, b) => a + b, 0) / scores.length) }) +
        (scores.length > 1 && Math.min(...scores) < Math.max(...scores) ? " · " + t("tx.accuracyLowest", { pct: pct(Math.min(...scores)) }) : "")
      : undefined;
    const canReview = user.role !== "citizen" || mine;
    banner = showOriginal
      ? { state: "original", head: t("tx.showingOriginal", { lang: from }), sub: t("tx.showingOriginalSub", { lang: to }), toggleLabel: t("tx.showTranslation", { lang: to }), toggleHref: query({ original: null }) }
      : ready
        ? {
            state: "ready",
            head: t("tx.translatedBy", { from, to }),
            sub:
              (fresh === 0 ? t("tx.fromCache") : t("tx.justNow")) +
              (reviewed && reviewed < total ? " " + t("tx.notReviewed", { n: total - reviewed }) : "") +
              (needsCheck ? " " + tn("tx.needsCheckSub", needsCheck) : ""),
            chip: needsCheck
              ? t("tx.needsCheck")
              : settings.txLabel
                ? reviewed === total ? t("tx.reviewed") : reviewed ? t("tx.reviewedSome", { n: reviewed, total }) : t("tx.machine")
                : undefined,
            chipReviewed: reviewed === total && !needsCheck,
            chipWarn: needsCheck > 0,
            accuracy,
            accuracyHelp: t("tx.accuracyHelp"),
            toggleLabel: t("tx.showOriginal", { lang: from }),
            toggleHref: query({ original: "1" }),
            review: canReview && reviewed < total ? { proposalId: p.id, lang: viewLang, texts: proposalTexts } : undefined,
          }
        : {
            state: "translating",
            head: t("tx.translatingInto", { lang: to }),
            sub: done ? t("tx.someCached", { done, total }) : t("tx.firstTime", { lang: to }),
            failedHead: t("tx.failed", { lang: to }),
            failedSub: t("tx.failedSub"),
            missing: { lang: viewLang, texts: tx.missing.filter((m) => proposalTexts.includes(m)) },
          };
  }
  const dim = banner?.state === "translating";
  // Version notes and stream names are filled in quietly, without the banner.
  const otherMissing = tx.missing.filter((m) => !proposalTexts.includes(m));
  const textLang = translating ? viewLang : srcLang;
  const credit = (v: (typeof p.versions)[number]) => versionCredit(v, p.names, t, locale);
  const changes = (v: (typeof p.versions)[number]) => {
    const i = p.versions.indexOf(v);
    return i > 0 ? changesOf(p.versions[i - 1], v) : [];
  };

  return (
    <TextOnlyProvider initial={textOnly}>
    <main className="view-main" data-screen-label="Proposal">
      {otherMissing.length ? <TranslateMissing lang={viewLang} texts={otherMissing} /> : null}
      <Link href="/" className="back-link"><BackIcon />{t("view.allProposals")}</Link>
      <div className="view-cols">
        <article className="view-article">
          {isOld && pinned && latest ? (
            <div className="notice-old">
              <span>{t("view.viewingOld", { version: `v${pinned.number}`, date: shortDate(pinned.publishedAt, locale), note: tx.get(pinned.note, pinned.language).text })}</span>
              <Link href={query({ v: null })} className="btn-link">{t("view.viewLatest", { version: `v${latest.number}` })}</Link>
            </div>
          ) : null}
          {!latest ? <div className="notice-draft">{t("view.draftNotice")}</div> : null}
          {banner ? <TranslationBanner {...banner} /> : null}
          <h1 className={`view-title${dim ? " dim" : ""}`} lang={textLang}>{T(shown.title)}</h1>
          {shown.summary ? <p className={`view-summary${dim ? " dim" : ""}`} lang={textLang}>{T(shown.summary)}</p> : null}
          <div className="byline">
            <span className="avatar av-38">{p.author.initials}</span>
            <div className="who"><b><Link href={`/people/${p.author.id}`} className="name-link">{p.author.name}</Link></b><span>{metaLine}</span></div>
            {hasImages ? <TextOnlyButton /> : null}
            {latest && enabled.length > 1 ? (
              <ProposalLangMenu
                current={viewLang}
                source={srcLang}
                options={enabled.map((l) => ({ code: l.code, native: l.native, name: l.name, href: query({ lang: l.code, original: null }) }))}
              />
            ) : null}
          </div>

          <section className="card scores-card" aria-label={t("view.streamScores")}>
            <div className="head"><span className="eyebrow">{t("view.streamScores")}</span><span className="cap">{scoreCaption}</span></div>
            <div className="score-rows">
              {scored.map((s) => (
                <div className="score-row" key={s.streamId}>
                  <span className="name"><span className="dot" style={{ background: s.stream.color }} />{streamName(s.stream)}</span>
                  <span className="bar"><span style={{ width: `${s.score * 10}%`, background: s.stream.color }} /></span>
                  <span className="val"><b>{formatScore(s.score, settings.scale)}</b><span>{sfx}</span></span>
                </div>
              ))}
              {scored.length === 0 ? <div className="cap">{t("view.noStreams")}</div> : null}
              {unscored.length ? <div className="unscored">{t("view.notScored", { list: unscored.join(", ") })}</div> : null}
            </div>
          </section>

          <div className={`prose${dim ? " dim" : ""}`} lang={textLang}>
            <ProposalBody
              body={shown.body}
              T={T}
              accuracy={(text) => {
                // Each translated section shows its AI accuracy check on hover; low ones are marked.
                const f = translating ? tx.get(text, srcLang).fidelity : null;
                return { title: f != null ? t("tx.sectionAccuracy", { pct: Math.round((f / 4) * 100) }) : undefined, low: f != null && f < FIDELITY_MIN, lowNote: t("tx.lowSection") };
              }}
              fileMeta={(fid, size) => {
                const first = p.versions.find((v) => v.body.includes(`::file ${fid} `));
                return [size, first ? t("view.addedIn", { version: `v${first.number}` }) : t("view.inDraft")].filter(Boolean).join(" · ");
              }}
              labels={{ video: t("view.video") }}
            />
          </div>

          <Discussion
            proposalId={p.id}
            canComment={Boolean(latest)}
            isAuthor={mine}
            insights={p.insights}
            commentCount={commentCount}
            me={{ id: user.id, initials: user.initials }}
            participants={[...new Set(participants)]}
            translation={{
              enabled: settings.txComments,
              label: settings.txLabel,
              viewLang,
              defaultLang: settings.defaultLanguage,
              insightsLang: srcLang,
              languages: enabled.map(({ code, native }) => ({ code, native })),
            }}
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
              <span className="eyebrow">{t("view.status")}</span>
              {latest ? <span className="pill pill-green">{t("view.published")}</span> : <span className="pill pill-amber">{t("view.draft")}</span>}
            </div>
            <div className="status-line">
              {latest ? `${tn("view.versions", p.versions.length)} · ${t("view.lastPublished", { date: shortDate(latest.publishedAt, locale) })}` : t("view.notPublishedYet")}
            </div>
            {mine ? <Link href={`/proposals/${p.id}/edit`} className="btn-primary btn-block">{editLabel}</Link> : null}
            {contrib ? (
              <div className="suggest-box">
                {latest ? <Link href={`/proposals/${p.id}/suggest`} className="btn-primary btn-block">{t("view.suggest")}</Link> : null}
                <span className="hint">{latest ? t("view.suggestHint", { name: p.author.name.split(" ")[0] }) : t("view.suggestAfterPublish")}</span>
              </div>
            ) : null}
            {!mine && !contrib && latest ? <FollowButton proposalId={p.id} following={p.following} /> : null}
          </div>
          <TeamCard v={team} />
          {crs && crs.items.length ? (
            <nav className="card cr-card" aria-label={t("cr.title")}>
              <div className="row-head"><span className="eyebrow">{t("cr.title")}</span>{crs.openCount ? <span className="sub">{t("cr.open", { n: crs.openCount })}</span> : null}</div>
              {crs.items.map((c) => (
                <Link key={c.id} href={`/proposals/${p.id}/changes/${c.id}`} className="cr-item">
                  <span className={`avatar av-28${c.isMe ? " avatar-me" : ""}`}>{c.initials}</span>
                  <span className="cr-text">
                    <span className="cr-note">{c.note}</span>
                    <span className="cr-meta">{c.meta}</span>
                    <span className="cr-tags"><span className={`cr-st ${c.tone}`}>{c.status}</span>{c.conflicts ? <span className="cr-st returned">{c.conflicts}</span> : null}</span>
                  </span>
                </Link>
              ))}
            </nav>
          ) : null}
          <nav className="card versions-card" aria-label={t("view.versionHistory")}>
            <div className="eyebrow">{t("view.versionHistory")}</div>
            {mine && p.draft && latest ? (
              <Link href={`/proposals/${p.id}/edit`} className="version-btn pending-draft">
                <span className="vdot" />
                <span className="vtext"><span className="vhead">{t("view.unpublishedDraft")}</span><span className="vnote">{t("view.savedContinue", { when: savedAgo(p.draft.savedAt, i18n) })}</span></span>
              </Link>
            ) : null}
            {[...p.versions].reverse().map((v) => {
              const isLatest = v === latest;
              return (
                <Link key={v.number} href={query({ v: isLatest ? null : String(v.number) })} className="version-btn" aria-current={shown === v ? "true" : undefined} scroll={false}>
                  <span className="vdot" />
                  <span className="vtext">
                    <span className="vhead"><b>v{v.number}</b><span className="vdate">{shortDate(v.publishedAt, locale)}{credit(v) ? ` · ${credit(v)}` : ""}</span>{isLatest ? <span className="latest-tag">{t("view.latest")}</span> : null}</span>
                    <span className="vnote">{tx.get(v.note, v.language).text}</span>
                    {changes(v).length ? <span className="vchips">{changes(v).map((c, i) => <span key={i}>{changeLabel(c, t, tn)}</span>)}</span> : null}
                  </span>
                </Link>
              );
            })}
            {!latest ? <div className="muted-note">{t("view.nothingPublished")}</div> : null}
          </nav>
        </aside>
      </div>
    </main>
    </TextOnlyProvider>
  );
}
