import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getStreams } from "@/lib/data";
import { getSettings } from "@/lib/settings";
import { getProfile } from "@/lib/profile";
import { displayContent } from "@/lib/proposal-view";
import { contentTranslator } from "@/lib/content-tx";
import { formatScore, scaleSuffix } from "@/lib/scale";
import { shortAgo } from "@/lib/format";
import { catalogEntry } from "@/lib/languages";
import { getI18n, getLanguages } from "@/i18n/server";
import { BackIcon, EyeIcon } from "@/components/icons";
import { ProposalRow } from "@/components/ProposalRow";
import { TranslateMissing } from "@/components/TranslateMissing";
import { ProfileActions, StrengthsToggle, AddBioButton } from "./ProfileClient";

export async function generateMetadata({ params }: PageProps<"/people/[id]">) {
  const user = await requireUser();
  const profile = await getProfile((await params).id, user);
  return { title: `${profile?.user.name ?? "Profile"} · Insight Pitch` };
}

export default async function ProfilePage({ params, searchParams }: PageProps<"/people/[id]">) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const user = await requireUser();
  const [profile, streams, settings, i18n, languages] = await Promise.all([getProfile(id, user), getStreams(), getSettings(), getI18n(), getLanguages()]);
  if (!profile) notFound();
  const { t, tn, lang, locale } = i18n;
  const { user: u, isMe } = profile;
  const first = u.name.split(" ")[0];
  const tab = sp.tab === "comments" ? "comments" : "proposals";

  const tx = await contentTranslator(lang, settings.defaultLanguage, [
    ...profile.proposals.filter((p) => p.latest).flatMap((p) => [{ text: p.latest!.title, lang: p.latest!.language }, { text: p.latest!.summary, lang: p.latest!.language }]),
    ...profile.comments.map((c) => ({ text: c.proposal.title, lang: c.proposal.language })),
    ...streams.map((s) => ({ text: s.name, lang: settings.defaultLanguage })),
  ]);
  const streamName = (s: { name: string }) => tx.get(s.name, settings.defaultLanguage).text;
  const shown = (p: (typeof profile.proposals)[number]) => {
    const c = displayContent(p);
    const l = p.latest ? p.latest.language : lang;
    const title = tx.get(c.title, l), summary = tx.get(c.summary, l);
    return { title: title.text, summary: summary.text, translated: title.translated || summary.translated };
  };
  const stream = (sid: string) => streams.find((s) => s.id === sid);

  const strengths = profile.strengths.filter((s) => stream(s.streamId));
  const showStrengths = isMe || (u.strengthsPublic && strengths.length > 0);
  const showActive = !isMe && !(u.strengthsPublic && strengths.length > 0) && profile.streams.length > 0;
  const work = [u.title, u.org].filter(Boolean).join(", ");
  const headline = [work, u.location].filter(Boolean).join(" · ");
  const langName = (code: string) => languages.find((l) => l.code === code)?.native ?? catalogEntry(code)?.native ?? code;
  const details: [string, string][] = (
    [
      [t("prof.organisation"), u.org],
      [t("prof.location"), u.location],
      [t("prof.memberSince"), u.joined.toLocaleDateString(locale, { month: "short", year: "numeric" })],
      [t("prof.readsIn"), u.reads.map(langName).join(", ")],
    ] as [string, string][]
  ).filter((d) => d[1]);
  const sfx = scaleSuffix(settings.scale);

  const tabs = [
    ["proposals", t("prof.tabProposals"), profile.proposals.length],
    ["comments", t("prof.tabComments"), profile.comments.length],
  ] as const;

  const context = (c: (typeof profile.comments)[number]) =>
    !c.parentId ? t("prof.commentedOn") : c.parentAuthor?.id === u.id ? (isMe ? t("prof.inYourThread") : t("prof.inTheirThread")) : t("prof.repliedTo", { first: c.parentAuthor?.name.split(" ")[0] ?? "" });

  return (
    <main className="profile-main" data-screen-label="Profile">
      {tx.missing.length ? <TranslateMissing lang={lang} texts={tx.missing} /> : null}
      <Link href="/" className="back-link"><BackIcon />{t("prof.allProposals")}</Link>
      <div className="profile-head">
        <span className={`profile-avatar${isMe ? " me" : ""}`} aria-hidden="true">{u.initials}</span>
        <div className="profile-id">
          <div className="tags">
            <span className={`role-pill ${u.role}`}>{t(`role.${u.role}`)}</span>
            {isMe ? <span className="you">{t("prof.thisIsYou")}</span> : null}
          </div>
          <h1>{u.name}</h1>
          {headline ? <div className="headline">{headline}</div> : null}
        </div>
        <ProfileActions
          isMe={isMe}
          personId={u.id}
          name={u.name}
          following={profile.following}
          role={t(`role.${u.role}`)}
          profile={{ name: u.name, title: u.title, org: u.org, location: u.location, bio: u.bio, reads: u.reads }}
          languages={languages.filter((l) => l.enabled).map((l) => ({ code: l.code, native: l.native }))}
        />
      </div>

      <div className="profile-cols">
        <section className="profile-section">
          <nav className="profile-tabs" aria-label={u.name}>
            {tabs.map(([key, label, n]) => (
              <Link key={key} href={key === "proposals" ? `/people/${u.id}` : `/people/${u.id}?tab=${key}`} aria-current={tab === key ? "page" : undefined} scroll={false}>
                {label} <span className="n">{n}</span>
              </Link>
            ))}
          </nav>

          {tab === "proposals" ? (
            profile.proposals.length ? (
              <div className="rows">
                {profile.proposals.map((p) => (
                  <ProposalRow key={p.id} p={p} shown={shown(p)} isMine={isMe} streams={streams} streamName={streamName} settings={settings} i18n={i18n} showAuthor={false} />
                ))}
              </div>
            ) : (
              <div className="profile-empty">{isMe ? t("prof.noPropsMe") : t("prof.noPropsOther", { first })}</div>
            )
          ) : profile.comments.length ? (
            <div className="rows" data-testid="profile-comments">
              {profile.comments.map((c) => {
                const hidden = c.status !== "visible" && !isMe;
                return (
                  <div className="pc-row" key={c.id} data-testid="profile-comment">
                    <div className="ctx">
                      <span>{context(c)}</span>
                      <Link className="row-link" href={`/proposals/${c.proposalId}#cmt-${c.parentId ?? c.id}`}>{tx.get(c.proposal.title, c.proposal.language).text}</Link>
                    </div>
                    {hidden ? <div className="hidden">{t("prof.hiddenReview")}</div> : <div className="text">{c.body}</div>}
                    <div className="meta">
                      <span>{shortAgo(c.createdAt, i18n)}</span>
                      {c.likes > 0 ? (<><span>·</span><span>{tn("prof.likes", c.likes)}</span></>) : null}
                      {c.status !== "visible" && isMe ? <span className="pill pill-red">{t("prof.pendingReview")}</span> : null}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="profile-empty">{isMe ? t("prof.noCommentsMe") : t("prof.noCommentsOther", { first })}</div>
          )}
        </section>

        <aside className="profile-aside">
          {showStrengths ? (
            <div className="card" data-testid="strengths">
              <div className="pa-head">
                <div className="stack">
                  <span className="eyebrow">{t("prof.strengths")}</span>
                  <span className="cap">{isMe ? t("prof.strengthCaptionMe") : t("prof.strengthCaptionOther")}</span>
                </div>
                {isMe ? <StrengthsToggle value={u.strengthsPublic} /> : null}
              </div>
              {isMe ? (
                <div className={`vis-line${u.strengthsPublic ? " on" : ""}`}><EyeIcon />{u.strengthsPublic ? t("prof.visPublic") : t("prof.visPrivate")}</div>
              ) : null}
              {strengths.length ? (
                <div className="strengths">
                  {strengths.map((s) => {
                    const st = stream(s.streamId)!;
                    const ev = [s.proposals ? tn("prof.evProposals", s.proposals) : "", s.comments ? tn("prof.evComments", s.comments) : ""].filter(Boolean).join(" · ");
                    return (
                      <div className="strength" key={s.streamId}>
                        <div className="line">
                          <span className="nm"><span className="dot dot-9" style={{ background: st.color }} /><span>{streamName(st)}</span></span>
                          <span className="bar"><span style={{ width: `${s.level * 10}%`, background: st.color }} /></span>
                          <span className="val"><b>{formatScore(s.level, settings.scale)}</b><span>{sfx}</span></span>
                        </div>
                        <span className="ev">{ev}</span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="pa-note">{t("prof.noStrengths")}</div>
              )}
            </div>
          ) : null}

          <div className="card">
            <span className="eyebrow">{t("prof.about")}</span>
            {u.bio ? <p className="pa-bio">{u.bio}</p> : isMe ? <AddBioButton /> : null}
            <dl className="pa-details">
              {details.map(([k, v]) => (
                <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
              ))}
            </dl>
          </div>

          {showActive ? (
            <div className="card">
              <div className="pa-head">
                <div className="stack">
                  <span className="eyebrow">{t("prof.activeIn")}</span>
                  <span className="cap">{t("prof.activeInCaption", { first })}</span>
                </div>
              </div>
              <div className="pa-streams">
                {profile.streams.map((x) => {
                  const st = stream(x.streamId);
                  if (!st) return null;
                  return (
                    <Link key={st.id} href={`/?stream=${st.id}`}>
                      <span className="dot dot-9" style={{ background: st.color }} />
                      <span className="nm">{streamName(st)}</span>
                      <span className="n">{x.count}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ) : null}
        </aside>
      </div>
    </main>
  );
}
