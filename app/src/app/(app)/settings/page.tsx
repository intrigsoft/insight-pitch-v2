import Link from "next/link";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { translations } from "@/db/schema";
import { isAdmin, requireUser } from "@/lib/auth";
import { getModerationQueue, getStreams, getStreamUsage } from "@/lib/data";
import { getSettings } from "@/lib/settings";
import { contentTranslator } from "@/lib/content-tx";
import { LANGUAGE_CATALOG } from "@/lib/languages";
import { getI18n, getLanguages } from "@/i18n/server";
import { STREAM_COLORS } from "@/db/seed-data";
import { TranslateMissing } from "@/components/TranslateMissing";
import { StreamsTab } from "./StreamsTab";
import { ScoringTab } from "./ScoringTab";
import { LinkButton } from "./LinkButton";
import { ModerationTab } from "./ModerationTab";
import { LanguagesTab } from "./LanguagesTab";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: `${t("set.title")} · Insight Pitch` };
}

const TABS = [
  ["streams", "set.tabStreams"],
  ["scoring", "set.tabScoring"],
  ["overlaps", "set.tabOverlaps"],
  ["moderation", "set.tabModeration"],
  ["languages", "set.tabLanguages"],
] as const;

export default async function SettingsPage({ searchParams }: PageProps<"/settings">) {
  const user = await requireUser();
  const i18n = await getI18n();
  const { t, lang } = i18n;
  if (!isAdmin(user)) {
    return (
      <main className="simple-page">
        <h1>{t("set.adminsOnly")}</h1>
        <p>{t("set.adminsOnlyText")}</p>
        <Link href="/" className="btn-secondary">{t("set.backToProposals")}</Link>
      </main>
    );
  }
  const sp = await searchParams;
  const tab = (TABS.find(([id]) => id === sp.tab)?.[0] ?? "streams") as (typeof TABS)[number][0];
  const [streams, usage, settings, queue, langs] = await Promise.all([getStreams(), getStreamUsage(), getSettings(), getModerationQueue(), getLanguages()]);
  const active = streams.filter((s) => s.active);

  // Stream names and descriptions are admin-written content in the default language.
  const tx = await contentTranslator(lang, settings.defaultLanguage, streams.flatMap((s) => [{ text: s.name, lang: settings.defaultLanguage }, { text: s.description, lang: settings.defaultLanguage }]));
  const tr = (text: string) => tx.get(text, settings.defaultLanguage).text;
  const shownStreams = streams.map((s) => ({ ...s, label: tr(s.name), descLabel: tr(s.description) }));
  const nameOf = (id: string) => shownStreams.find((s) => s.id === id)!.label;

  // Overlap matrix: published proposals scored in both streams.
  const both = (a: string, b: string) => usage.publishedSets.filter((set) => set.has(a) && set.has(b)).length;
  let mx = 1;
  for (const a of active) for (const b of active) if (a.id !== b.id) mx = Math.max(mx, both(a.id, b.id));
  const suggestions: { a: (typeof streams)[number]; b: (typeof streams)[number]; c: number }[] = [];
  active.forEach((a, i) => active.slice(i + 1).forEach((b) => {
    const c = both(a.id, b.id);
    if (c >= 2 && !a.related.includes(b.id)) suggestions.push({ a, b, c });
  }));
  suggestions.sort((x, y) => y.c - x.c);

  const cacheCounts = tab === "languages"
    ? Object.fromEntries((await db.select({ lang: translations.lang, n: sql<number>`count(*)::int` }).from(translations).groupBy(translations.lang)).map((r) => [r.lang, r.n]))
    : {};

  return (
    <main className="settings-main" data-screen-label="Admin settings">
      {tx.missing.length ? <TranslateMissing lang={lang} texts={tx.missing} /> : null}
      <div className="settings-intro">
        <span className="eyebrow">{t("set.admin")}</span>
        <h1>{t("set.title")}</h1>
        <p>{tab === "languages" ? t("set.introLanguages") : t("set.intro")}</p>
      </div>
      <nav className="settings-tabs" aria-label={t("set.sections")}>
        {TABS.map(([id, key]) => (
          <Link key={id} href={id === "streams" ? "/settings" : `/settings?tab=${id}`} className="settings-tab" aria-current={tab === id ? "page" : undefined} scroll={false}>
            {t(key)}{id === "moderation" && queue.length ? ` (${queue.length})` : ""}
          </Link>
        ))}
      </nav>

      {tab === "streams" ? <StreamsTab streams={shownStreams.map((s) => ({ ...s, count: usage.countAll(s.id) }))} colors={STREAM_COLORS} /> : null}

      {tab === "scoring" ? <ScoringTab settings={settings} /> : null}

      {tab === "moderation" ? <ModerationTab items={queue.map((q) => ({ ...q, createdAt: q.createdAt.toISOString() }))} /> : null}

      {tab === "languages" ? (
        <LanguagesTab
          languages={langs.map((l) => ({ ...l, cached: cacheCounts[l.code] ?? 0 }))}
          catalog={LANGUAGE_CATALOG.filter((c) => !langs.some((l) => l.code === c.code)).map(({ code, name, native }) => ({ code, name, native }))}
          settings={{ defaultLanguage: settings.defaultLanguage, txOnPublish: settings.txOnPublish, txComments: settings.txComments, txLabel: settings.txLabel, glossary: settings.glossary }}
        />
      ) : null}

      {tab === "overlaps" ? (
        <div className="overlap-cols">
          <div className="overlap-main">
            <p>{t("set.overlapIntro")}</p>
            <div className="matrix-wrap">
              <table className="matrix">
                <thead>
                  <tr>
                    <th className="corner" />
                    {active.map((s) => (
                      <th key={s.id} className="col" scope="col"><div><span className="dot dot-8" style={{ background: s.color }} />{nameOf(s.id)}</div></th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {active.map((a) => (
                    <tr key={a.id}>
                      <td className="rowname"><span><span className="dot dot-8" style={{ background: a.color }} />{nameOf(a.id)}</span></td>
                      {active.map((b) => {
                        if (a.id === b.id) return <td key={b.id} className="cell diag">{both(a.id, a.id)}</td>;
                        const c = both(a.id, b.id);
                        const alpha = c ? 0.12 + (0.7 * c) / mx : 0;
                        return (
                          <td
                            key={b.id}
                            className="cell"
                            title={t("set.overlapCell", { a: nameOf(a.id), b: nameOf(b.id), n: c })}
                            style={{
                              background: c ? `rgba(46,94,69,${alpha.toFixed(2)})` : "#fbfaf7",
                              color: alpha > 0.5 ? "#fff" : "#18201b",
                              boxShadow: a.related.includes(b.id) ? "inset 0 0 0 2px #18201b" : "none",
                            }}
                          >
                            {c || ""}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="card suggest">
            <div className="stack"><span className="eyebrow">{t("set.suggested")}</span><span className="sub">{t("set.suggestedText")}</span></div>
            {suggestions.map((s) => (
              <div className="suggest-row" key={s.a.id + s.b.id}>
                <div className="txt"><b>{nameOf(s.a.id)} + {nameOf(s.b.id)}</b><span>{t("set.sharedProposals", { n: s.c })}</span></div>
                <LinkButton a={s.a.id} b={s.b.id} />
              </div>
            ))}
            {suggestions.length === 0 ? <div className="none">{t("set.noSuggestions")}</div> : null}
          </div>
        </div>
      ) : null}
    </main>
  );
}
