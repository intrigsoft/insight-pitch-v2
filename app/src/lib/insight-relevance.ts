import "server-only";
import { and, desc, eq, isNull, ne, or } from "drizzle-orm";
import { db } from "@/db";
import { insights, proposalVersions } from "@/db/schema";
import { plainBody } from "./body";
import { systemOne, type ScoreAnswer } from "./jev";

// Jev judges how relevant each insight is to the proposal as it now stands, so the points that matter most to it
// come first. Insights are judged against the latest version and judged again when a new version is published.
// One Jev call covers a batch of insights, one Score question each.

const LEVELS = [
  "0: Unrelated to the proposal.",
  "1: Tangential: touches the proposal only in passing.",
  "2: Relevant, but a minor or secondary point.",
  "3: Important: bears directly on whether or how the proposal works.",
  "4: Central: goes to the heart of the proposal, such as its cost, feasibility, who it serves or its main risk.",
];
const TOP = LEVELS.length - 1;

const INSTRUCTIONS: Record<string, string> = {
  concern: "How relevant and important is this concern to the proposal as written?",
  suggestion: "How relevant and important is this suggested change to the proposal as written?",
  clarification: "How relevant and important is this open question to the proposal as written?",
};

const BATCH = 20;

/** Scores the proposal's insights that haven't been judged against its latest version. */
export async function scoreInsights(proposalId: string) {
  const [v] = await db
    .select({ number: proposalVersions.number, title: proposalVersions.title, summary: proposalVersions.summary, body: proposalVersions.body })
    .from(proposalVersions)
    .where(eq(proposalVersions.proposalId, proposalId))
    .orderBy(desc(proposalVersions.number))
    .limit(1);
  if (!v) return;
  const stale = await db
    .select({ id: insights.id, kind: insights.kind, text: insights.text })
    .from(insights)
    .where(and(eq(insights.proposalId, proposalId), or(isNull(insights.relevanceVersion), ne(insights.relevanceVersion, v.number))));
  for (let i = 0; i < stale.length; i += BATCH) {
    const batch = stale.slice(i, i + BATCH);
    const r = await systemOne(
      { proposal: { title: v.title, summary: v.summary, text: plainBody(v.body).slice(0, 8000) }, points: batch.map((x, j) => ({ id: `i${j}`, kind: x.kind, text: x.text })) },
      Object.fromEntries(batch.map((x, j) => [`i${j}`, { type: "score" as const, instructions: `${INSTRUCTIONS[x.kind]} Judge point ${`i${j}`}: "${x.text}"`, criteria: LEVELS }])),
    );
    if (!r) return;
    await Promise.all(
      batch.map((x, j) => {
        const a = r.answers[`i${j}`] as ScoreAnswer | undefined;
        if (a?.type !== "score") return null;
        // Probability-weighted, so two "important" points still order by how sure Jev is.
        const expected = Object.entries(a.probabilities ?? {}).reduce((sum, [k, p]) => sum + Number(k) * p, 0);
        const level = a.probabilities && Number.isFinite(expected) ? expected : a.score;
        return db.update(insights).set({ relevance: Math.round((level / TOP) * 100), relevanceVersion: v.number }).where(eq(insights.id, x.id));
      }),
    );
  }
}

// One scoring run per proposal at a time; anything that arrives meanwhile triggers one more run afterwards.
const running = new Map<string, boolean>();

/** Scores insights in the background. Call it from `after()`. */
export async function scoreInsightsSoon(proposalId: string) {
  if (running.has(proposalId)) {
    running.set(proposalId, true);
    return;
  }
  try {
    do {
      running.set(proposalId, false);
      await scoreInsights(proposalId).catch((e) => console.warn("[insights] relevance:", e));
    } while (running.get(proposalId));
  } finally {
    running.delete(proposalId);
  }
}
