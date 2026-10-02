import type { ProposalSummary, ScoreRow, Stream } from "./data";

/** What a proposal shows by default: its latest published version, or its draft if never published. */
export function displayContent(p: Pick<ProposalSummary, "latest" | "draft">) {
  return p.latest ?? p.draft!;
}

/** Scores joined with their stream, highest first; streams that no longer exist are dropped. */
export function sortedScores(scores: ScoreRow[], streams: Stream[]) {
  return scores
    .map((s) => ({ ...s, stream: streams.find((st) => st.id === s.streamId)! }))
    .filter((s) => s.stream)
    .sort((a, b) => b.score - a.score || a.stream.position - b.stream.position);
}
