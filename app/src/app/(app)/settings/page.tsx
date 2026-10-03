import Link from "next/link";
import { isAdmin, requireUser } from "@/lib/auth";
import { getModerationQueue, getStreams, getStreamUsage } from "@/lib/data";
import { getSettings } from "@/lib/settings";
import { STREAM_COLORS } from "@/db/seed-data";
import { StreamsTab } from "./StreamsTab";
import { ScoringTab } from "./ScoringTab";
import { LinkButton } from "./LinkButton";
import { ModerationTab } from "./ModerationTab";

export const metadata = { title: "Settings · Insight Pitch" };

const TABS = [["streams", "Streams"], ["scoring", "Scoring"], ["overlaps", "Overlaps"], ["moderation", "Moderation"]] as const;

export default async function SettingsPage({ searchParams }: PageProps<"/settings">) {
  const user = await requireUser();
  if (!isAdmin(user)) {
    return (
      <main className="simple-page">
        <h1>Admins only</h1>
        <p>Settings are managed by Insight Pitch administrators. Ask an admin if a stream or scoring rule needs to change.</p>
        <Link href="/" className="btn-secondary">Back to proposals</Link>
      </main>
    );
  }
  const sp = await searchParams;
  const tab = (TABS.find(([id]) => id === sp.tab)?.[0] ?? "streams") as (typeof TABS)[number][0];
  const [streams, usage, settings, queue] = await Promise.all([getStreams(), getStreamUsage(), getSettings(), getModerationQueue()]);
  const active = streams.filter((s) => s.active);

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

  return (
    <main className="settings-main" data-screen-label="Admin settings">
      <div className="settings-intro">
        <span className="eyebrow">Admin</span>
        <h1>Settings</h1>
        <p>Streams are the public policy areas proposals are organised and scored against. A proposal can belong to several streams, and streams can be marked as overlapping.</p>
      </div>
      <nav className="settings-tabs" aria-label="Settings sections">
        {TABS.map(([id, label]) => (
          <Link key={id} href={id === "streams" ? "/settings" : `/settings?tab=${id}`} className="settings-tab" aria-current={tab === id ? "page" : undefined} scroll={false}>
            {label}{id === "moderation" && queue.length ? ` (${queue.length})` : ""}
          </Link>
        ))}
      </nav>

      {tab === "streams" ? (
        <StreamsTab streams={streams.map((s) => ({ ...s, count: usage.countAll(s.id) }))} colors={STREAM_COLORS} />
      ) : null}

      {tab === "scoring" ? <ScoringTab settings={settings} /> : null}

      {tab === "moderation" ? (
        <ModerationTab
          items={queue.map((q) => ({ ...q, createdAt: q.createdAt.toISOString() }))}
        />
      ) : null}

      {tab === "overlaps" ? (
        <div className="overlap-cols">
          <div className="overlap-main">
            <p>Each cell counts published proposals scored in both streams. The diagonal is the stream&apos;s total. Outlined cells are streams you&apos;ve marked as overlapping.</p>
            <div className="matrix-wrap">
              <table className="matrix">
                <thead>
                  <tr>
                    <th className="corner" />
                    {active.map((s) => (
                      <th key={s.id} className="col" scope="col"><div><span className="dot dot-8" style={{ background: s.color }} />{s.name}</div></th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {active.map((a) => (
                    <tr key={a.id}>
                      <td className="rowname"><span><span className="dot dot-8" style={{ background: a.color }} />{a.name}</span></td>
                      {active.map((b) => {
                        if (a.id === b.id) return <td key={b.id} className="cell diag">{both(a.id, a.id)}</td>;
                        const c = both(a.id, b.id);
                        const alpha = c ? 0.12 + (0.7 * c) / mx : 0;
                        return (
                          <td
                            key={b.id}
                            className="cell"
                            title={`${a.name} + ${b.name}: ${c} shared`}
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
            <div className="stack"><span className="eyebrow">Suggested overlaps</span><span className="sub">Stream pairs that often share proposals but aren&apos;t linked yet.</span></div>
            {suggestions.map((s) => (
              <div className="suggest-row" key={s.a.id + s.b.id}>
                <div className="txt"><b>{s.a.name} + {s.b.name}</b><span>{s.c} shared proposals</span></div>
                <LinkButton a={s.a.id} b={s.b.id} />
              </div>
            ))}
            {suggestions.length === 0 ? <div className="none">No suggestions right now.</div> : null}
          </div>
        </div>
      ) : null}
    </main>
  );
}
