import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getStreams, getVisibleProposals } from "@/lib/data";
import { getSettings } from "@/lib/settings";
import { timeAgo } from "@/lib/format";
import { formatScore } from "@/lib/scale";
import { displayContent, sortedScores } from "@/lib/proposal-view";
import { CommentIcon } from "@/components/icons";
import { SortSelect } from "./SortSelect";

export const metadata = { title: "Proposals · Insight Pitch" };

const TABS = [
  ["all", "All proposals"],
  ["mine", "My proposals"],
  ["drafts", "Drafts"],
  ["following", "Following"],
] as const;
type Tab = (typeof TABS)[number][0];
type Sort = "recent" | "discussed" | "score";

export default async function ProposalsPage({ searchParams }: PageProps<"/">) {
  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k][0] : sp[k]) ?? "";
  const user = await requireUser();
  const [visible, streams, settings] = await Promise.all([getVisibleProposals(user), getStreams(), getSettings()]);

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
  const tabLabel = TABS.find(([id]) => id === tab)![1];

  const needle = q.toLowerCase();
  let rows = lists[tab].filter((p) => {
    const c = displayContent(p);
    const hay = [c.title, c.summary, p.author.name, ...p.scores.map((s) => streams.find((st) => st.id === s.streamId)?.name ?? "")].join(" ").toLowerCase();
    return (!needle || hay.includes(needle)) && (!curStream || p.scores.some((s) => s.streamId === curStream.id));
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

  const subtitle =
    `${rows.length} ${rows.length === 1 ? "proposal" : "proposals"}` +
    (curStream ? ` in ${tabLabel.toLowerCase()}` : "") +
    (q ? ` matching “${q}”` : "");

  return (
    <main className="list-main" data-screen-label="Proposals">
      <aside className="list-side">
        <nav className="side-group" aria-label="Library">
          <div className="eyebrow">Library</div>
          {TABS.map(([id, label]) => (
            <Link key={id} href={href({ tab: id === "all" ? null : id })} className="tab-btn" aria-current={tab === id ? "page" : undefined}>
              <span>{label}</span><span className="count">{lists[id].length}</span>
            </Link>
          ))}
        </nav>
        <nav className="side-group" aria-label="Streams">
          <div className="eyebrow">Streams</div>
          {activeStreams.map((st) => (
            <Link key={st.id} href={href({ stream: curStream?.id === st.id ? null : st.id })} className="stream-btn" aria-current={curStream?.id === st.id ? "true" : undefined}>
              <span className="dot" style={{ background: st.color }} />
              <span className="name">{st.name}</span>
              <span className="count">{visible.filter((p) => p.scores.some((s) => s.streamId === st.id)).length}</span>
            </Link>
          ))}
        </nav>
      </aside>

      <section className="list-section">
        <div className="list-head">
          <div className="titles">
            <h1>{curStream ? curStream.name : tabLabel}</h1>
            <div className="sub">{subtitle}</div>
          </div>
          <SortSelect value={sort} scoreLabel={curStream ? `Highest ${curStream.name} score` : "Highest score"} />
        </div>

        {rows.length > 0 ? (
          <div className="rows">
            {rows.map((p) => {
              const c = displayContent(p);
              const isMine = p.author.id === user.id;
              const isDraft = !p.latest;
              const hasPending = Boolean(p.latest && p.draft && isMine);
              return (
                <Link key={p.id} href={`/proposals/${p.id}`} className="row">
                  {isDraft || hasPending ? (
                    <div className="badges">
                      {isDraft ? <span className="pill pill-amber">Draft</span> : null}
                      {hasPending ? <span className="pill pill-amber">Unpublished changes</span> : null}
                    </div>
                  ) : null}
                  <h2>{c.title}</h2>
                  {c.summary ? <p>{c.summary}</p> : null}
                  {p.scores.length ? (
                    <div className="score-chips">
                      {sortedScores(p.scores, streams).map((s) => (
                        <span key={s.streamId} className="score-chip">
                          <span className="dot dot-8" style={{ background: s.stream.color }} />
                          {s.stream.name}
                          {settings.showPublic ? <b>{formatScore(s.score, settings.scale)}</b> : null}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  <div className="row-meta">
                    <span className={`avatar av-24`}>{p.author.initials}</span>
                    <span className="author">{p.author.name}</span>
                    <span>·</span><span>Updated {timeAgo(p.updatedAt)}</span>
                    <span>·</span><span>{p.latest ? `v${p.latest.number}` : "Not published"}</span>
                    <span className="comment-count" aria-label={`${p.commentCount} comments`}><CommentIcon />{p.commentCount}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="empty">
            <div className="t">No proposals match</div>
            <div className="d">Try a different search or clear your filters.</div>
            <Link href="/" className="btn-secondary">Clear filters</Link>
          </div>
        )}
      </section>
    </main>
  );
}
