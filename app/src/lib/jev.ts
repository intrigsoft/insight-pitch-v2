import "server-only";

// Jev (TypeSafe System One) scores a proposal against each stream in one call.
// Each stream is a Score question with ten rubric levels; level 0 maps to score 1 and level 9 to score 10.

const API_URL = (process.env.TYPESAFE_BASE_URL || "https://api.typesafe.ai") + "/v1/systemone";
const MODEL = process.env.TYPESAFE_MODEL || "jev-latest";
const TIMEOUT_MS = 20_000;

const RUBRIC = [
  "1: Barely touches this stream; at most a passing mention.",
  "2: Minor, indirect effect on this stream.",
  "3: Some relevance, but this stream is clearly secondary.",
  "4: A noticeable secondary effect on this stream.",
  "5: Moderate impact; this stream is one of several the proposal affects.",
  "6: Substantial impact on this stream.",
  "7: A major part of the proposal concerns this stream.",
  "8: Strong, direct impact; this stream is central to the proposal.",
  "9: The proposal is primarily about this stream.",
  "10: Transformative impact; the proposal is entirely about this stream.",
];

export type StreamForScoring = { id: string; name: string; description: string };
export type JevScore = { score: number; raw: number; confidence: number };
export type JevResult = { ok: true; model: string; scores: Record<string, JevScore> } | { ok: false; reason: string };

export function jevConfigured() {
  return Boolean(process.env.TYPESAFE_API_KEY?.trim());
}

export async function scoreWithJev(
  proposal: { title: string; summary: string; body: string },
  streams: StreamForScoring[],
): Promise<JevResult> {
  if (!jevConfigured()) return { ok: false, reason: "TYPESAFE_API_KEY is not set" };
  if (streams.length === 0) return { ok: true, model: MODEL, scores: {} };

  const questions: Record<string, unknown> = {};
  streams.forEach((s, i) => {
    questions[`s${i}`] = {
      type: "score",
      instructions: `How strongly does this public policy proposal affect the "${s.name}" stream (${s.description || s.name})?`,
      criteria: RUBRIC,
    };
  });

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.TYPESAFE_API_KEY}` },
      body: JSON.stringify({
        model: MODEL,
        state: { title: proposal.title, summary: proposal.summary, proposal: proposal.body },
        questions,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return { ok: false, reason: `TypeSafe API ${res.status}: ${(await res.text()).slice(0, 200)}` };
    const data = (await res.json()) as { model?: string; answers?: Record<string, { type: string; score?: number; confidence?: number }> };
    const scores: Record<string, JevScore> = {};
    streams.forEach((s, i) => {
      const a = data.answers?.[`s${i}`];
      if (a?.type === "score" && typeof a.score === "number") {
        const raw = a.score + 1;
        scores[s.id] = { raw, score: Math.min(10, Math.max(1, Math.round(raw))), confidence: a.confidence ?? 0 };
      }
    });
    return { ok: true, model: data.model ?? MODEL, scores };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
}
