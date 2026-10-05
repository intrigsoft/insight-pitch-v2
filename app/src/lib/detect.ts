import "server-only";
import { plainBody, type Change } from "./body";
import { scoreWithJev, type JevScore } from "./jev";
import { summarise } from "./openai";
import type { Stream } from "./data";
import type { MessageKey } from "@/i18n/en";
import type { T, TN } from "@/i18n/core";

// Streams are detected from the proposal text every time it's saved: Jev scores it against every active stream and
// the ones it affects at least a little are kept. Without Jev, stream names and descriptions are matched as keywords.

/** Lowest Jev score (1–10) at which a stream counts as affected. 3 is "some relevance, but clearly secondary". */
export const DETECT_MIN = 3;

type Content = { title: string; summary: string; body: string };

export async function detectStreams(c: Content, streams: Stream[]): Promise<{ scores: Record<string, JevScore>; source: "jev" | "keywords" }> {
  const active = streams.filter((s) => s.active);
  const text = { title: c.title, summary: c.summary, body: plainBody(c.body) };
  const r = await scoreWithJev(text, active.map((s) => ({ id: s.id, name: s.name, description: s.description })));
  if (r.ok) return { scores: Object.fromEntries(Object.entries(r.scores).filter(([, s]) => s.raw >= DETECT_MIN)), source: "jev" };
  console.warn("[detect] Jev unavailable, matching keywords:", r.reason);
  return { scores: keywordScores(text, active), source: "keywords" };
}

function keywordScores(c: Content, streams: Stream[]) {
  const t = ` ${c.title} ${c.summary} ${c.body} `.toLowerCase();
  const out: Record<string, JevScore> = {};
  for (const s of streams) {
    const words = [...new Set(`${s.name} ${s.description}`.toLowerCase().split(/[^\p{L}]+/u).filter((w) => w.length > 3))];
    const hits = words.reduce((n, w) => n + t.split(w).length - 1, 0);
    if (hits >= 2) {
      const score = Math.min(9, Math.max(3, Math.round(2 + hits * 0.8)));
      out[s.id] = { score, raw: score, confidence: 0 };
    }
  }
  return out;
}

/* Version descriptions */


/** A description built from the detected changes, used when AI isn't available. */
export function ruleNote(changes: Change[], t: T, tn: TN): string {
  const parts = changes.map((c) => {
    switch (c.kind) {
      case "section": return t("note.section", { text: c.text });
      case "added": return tn(`note.added.${c.media}`, c.n);
      case "removed": return tn(`note.removed.${c.media}`, c.n);
      case "text": return t("note.text");
      default: return t(`note.${c.kind}` as MessageKey);
    }
  });
  return [...new Set(parts)].join("; ");
}

const NOTE_INSTRUCTIONS =
  "You write version descriptions for a public consultation platform where officials and citizens publish government proposals. " +
  "A description works like a commit message: one short line, at most 12 words, past tense, sentence case, no full stop. " +
  'Examples: "Added cost and funding sources", "Split construction into two phases; added access road plan", "Lowered threshold to 1 million; added redaction rules". ' +
  "Describe the substance of what changed, not formatting. Mention new images, tables, videos or files only when they carry content. " +
  "Write it in the language the new version is written in.";

const SUMMARY_INSTRUCTIONS =
  "You write the summary line for proposals on a public consultation platform where officials and citizens publish government proposals. " +
  "Write one or two plain sentences, at most 40 words, that state what is proposed and the main reason or benefit. Keep key numbers exactly as written. " +
  'Neutral, factual register; no hype, no "This proposal". Write in the same language as the proposal.';

/** A one- or two-sentence summary of a proposal, written by AI. Null if it isn't available. */
export async function aiSummary(title: string, body: string): Promise<string | null> {
  const out = await summarise(SUMMARY_INSTRUCTIONS, JSON.stringify({ title: title.trim(), body: plainBody(body).slice(0, 6000) }));
  const t = (out ?? "").trim().replace(/^["“]+|["”]+$/g, "").trim();
  return t && t.length <= 400 ? t : null;
}

/** One line describing what changed between two versions, written by AI. Null if it isn't available. */
export async function aiNote(prev: Content, cur: Content, changes: string[]): Promise<string | null> {
  const input = JSON.stringify({
    previousVersion: { title: prev.title, summary: prev.summary, body: plainBody(prev.body).slice(0, 4000) },
    newVersion: { title: cur.title, summary: cur.summary, body: plainBody(cur.body).slice(0, 4000) },
    detectedChanges: changes,
  });
  const out = await summarise(NOTE_INSTRUCTIONS, input);
  const line = (out ?? "").trim().split("\n")[0].replace(/^["'“]+|["'”.]+$/g, "").trim();
  return line && line.length <= 140 ? line : null;
}
