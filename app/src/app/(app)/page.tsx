import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getStreams, getVisibleProposals } from "@/lib/data";
import { getSettings } from "@/lib/settings";
import { timeAgo } from "@/lib/format";
import { formatScore } from "@/lib/scale";
import { displayContent, sortedScores } from "@/lib/proposal-view";
import { contentTranslator } from "@/lib/content-tx";
import { getI18n } from "@/i18n/server";
import { CommentIcon } from "@/components/icons";
import { Globe } from "@/components/LanguageMenu";
import { TranslateMissing } from "@/components/TranslateMissing";
import { SortSelect } from "./SortSelect";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: `${t("list.pageTitle")} · Insight Pitch` };
}

const TABS = [
  ["all", "list.tabAll"],
  ["mine", "list.tabMine"],
  ["drafts", "list.tabDrafts"],
  ["following", "list.tabFollowing"],
] as const;
type Tab = (typeof TABS)[number][0];
type Sort = "recent" | "discussed" | "score";

export default async function ProposalsPage({ searchParams }: PageProps<"/">) {
  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k][0] : sp[k]) ?? "";
  const user = await requireUser();
  const [visible, streams, settings, i18n] = await Promise.all([getVisibleProposals(user), getStreams(), getSettings(), getI18n()]);
  const { t, tn, lang } = i18n;

  // Titles, summaries and stream names in the reader's language. Drafts stay as written: only their author sees them.
  const tx = await contentTranslator(lang, settings.defaultLanguage, [
    ...visible.filter((p) => p.latest).flatMap((p) => [{ text: p.latest!.title, lang: p.latest!.language }, { text: p.latest!.summary, lang: p.latest!.language }]),
    ...streams.map((s) => ({ text: s.name, lang: settings.defaultLanguage })),
  ]);
  const streamName = (s: { name: string }) => tx.get(s.name, settings.defaultLanguage).text;
  const shown = (p: (typeof visible)[number]) => {
    const c = displayContent(p);
    const l = p.latest ? p.latest.language : lang;
    const title = tx.get(c.title, l), summary = tx.get(c.summary, l);
    return { title: title.text, summary: summary.text, translated: title.translated || summary.translated, original: c };
  };

  const tab: Tab = (TABS.find(([id]) => id === one("tab"))?.[0] ?? "all") as Tab;
  const sort: Sort = (["recent", "discussed", "score"].includes(one("sort")) ? one("sort") : "recent") as Sort;
  const q = one("q").trim();
  const activeStreams = streams.filter((s) => s.active);
  const curStream = streams.find((s) => s.id === one("stream") && s.active) ?? null;

  const mine = visible.filter((p) => p.author.id === user.id);
  const lists: Record<Tab, typeof visible> = {
    all: visible,
    mine,
    drafts: mine.filter((p) => p.draft),
    following: visible.filter((p) => p.following),
  };
  const tabLabel = t(TABS.find(([id]) => id === tab)![1]);

  // Search matches both the original and the translated wording.
  const needle = q.toLowerCase();
  let rows = lists[tab].filter((p) => {
    const s = shown(p);
    const hay = [s.original.title, s.original.summary, s.title, s.summary, p.author.name, ...p.scores.flatMap((x) => {
      const st = streams.find((y) => y.id === x.streamId);
      return st ? [st.name, streamName(st)] : [];
    })].join(" ").toLowerCase();
    return (!needle || hay.includes(needle)) && (!curStream || p.scores.some((x) => x.streamId === curStream.id));
  });
  const scoreOf = (p: (typeof rows)[number]) =>
    curStream ? p.scores.find((s) => s.streamId === curStream.id)?.score ?? 0 : Math.max(0, ...p.scores.map((s) => s.score));
  rows = [...rows].sort((a, b) =>
    sort === "discussed" ? b.commentCount - a.commentCount : sort === "score" ? scoreOf(b) - scoreOf(a) : b.updatedAt.getTime() - a.updatedAt.getTime(),
  );

  const href = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams();
    const cur: Record<string, string> = { tab: tab === "all" ? "" : tab, stream: curStream?.id ?? "", q, sort: sort === "recent" ? "" : sort };
    for (const [k, v] of Object.entries({ ...cur, ...patch })) if (v) next.set(k, v);
    const s = next.toString();
    return s ? `/?${s}` : "/";
  };

  const subtitle = [tn("list.count", rows.length), curStream ? t("list.inTab", { tab: tabLabel }) : "", q ? t("list.matching", { q }) : ""].filter(Boolean).join(" ");

  return (
    <main className="list-main" data-screen-label="Proposals">
      {tx.missing.length ? <TranslateMissing lang={lang} texts={tx.missing} /> : null}
      <aside className="list-side">
        <nav className="side-group" aria-label={t("list.library")}>
          <div className="eyebrow">{t("list.library")}</div>
          {TABS.map(([id, key]) => (
            <Link key={id} href={href({ tab: id === "all" ? null : id })} className="tab-btn" aria-current={tab === id ? "page" : undefined}>
              <span>{t(key)}</span><span className="count">{lists[id].length}</span>
            </Link>
          ))}
        </nav>
        <nav className="side-group" aria-label={t("list.streams")}>
          <div className="eyebrow">{t("list.streams")}</div>
          {activeStreams.map((st) => (
            <Link key={st.id} href={href({ stream: curStream?.id === st.id ? null : st.id })} className="stream-btn" aria-current={curStream?.id === st.id ? "true" : undefined}>
              <span className="dot" style={{ background: st.color }} />
              <span className="name">{streamName(st)}</span>
              <span className="count">{visible.filter((p) => p.scores.some((s) => s.streamId === st.id)).length}</span>
            </Link>
          ))}
        </nav>
      </aside>

      <section className="list-section">
        <div className="list-head">
          <div className="titles">
            <h1>{curStream ? streamName(curStream) : tabLabel}</h1>
            <div className="sub">{subtitle}</div>
          </div>
          <SortSelect value={sort} scoreLabel={curStream ? t("list.sortStreamScore", { stream: streamName(curStream) }) : t("list.sortScore")} />
        </div>

        {rows.length > 0 ? (
          <div className="rows">
            {rows.map((p) => {
              const c = shown(p);
              const isMine = p.author.id === user.id;
              const isDraft = !p.latest;
              const hasPending = Boolean(p.latest && p.draft && isMine);
              return (
                <Link key={p.id} href={`/proposals/${p.id}`} className="row">
                  {isDraft || hasPending ? (
                    <div className="badges">
                      {isDraft ? <span className="pill pill-amber">{t("list.draft")}</span> : null}
                      {hasPending ? <span className="pill pill-amber">{t("list.unpublishedChanges")}</span> : null}
                    </div>
                  ) : null}
                  <h2>{c.title}</h2>
                  {c.summary ? <p>{c.summary}</p> : null}
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
                    <span className={`avatar av-24`}>{p.author.initials}</span>
                    <span className="author">{p.author.name}</span>
                    <span>·</span><span>{t("list.updated", { when: timeAgo(p.updatedAt, i18n) })}</span>
                    <span>·</span><span>{p.latest ? `v${p.latest.number}` : t("list.notPublished")}</span>
                    {c.translated && settings.txLabel ? (<><span>·</span><span className="tx-tag"><Globe size={13} />{t("list.translated")}</span></>) : null}
                    <span className="comment-count" aria-label={tn("list.comments", p.commentCount)}><CommentIcon />{p.commentCount}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="empty">
            <div className="t">{t("list.emptyTitle")}</div>
            <div className="d">{t("list.emptyText")}</div>
            <Link href="/" className="btn-secondary">{t("list.clearFilters")}</Link>
          </div>
        )}
      </section>
    </main>
  );
}
