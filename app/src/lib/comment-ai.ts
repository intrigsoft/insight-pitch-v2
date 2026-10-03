import "server-only";
import { systemOne, type ChoiceAnswer, type NoulAnswer, type ScoreAnswer } from "./jev";
import { summarise } from "./openai";
import { hasRomanisedProfanity } from "./romanised-profanity";

// Jev reads each new comment once, before it posts: conduct, relevance to the proposal, and the kind of point it makes.
// Insight grouping is a second Jev call; only brand-new insights need OpenAI to write a one-line summary.

export const FLAG_LABELS = {
  abusive: "Abusive language",
  hostile: "Hostile language",
  personal_attack: "Personal attack",
  accusation: "Unsupported accusation",
  spam: "Spam",
  shouting: "Shouting",
} as const;

const CONDUCT = {
  none: "Civil and acceptable for a public discussion, including strong disagreement or criticism of the proposal.",
  abusive: "Insults, slurs or abusive language.",
  hostile: "Hostile or aggressive tone aimed at other people, such as telling them to shut up or go away.",
  personal_attack: "Attacks the competence or character of a person instead of discussing the proposal.",
  accusation: "Accuses someone of corruption, bribery or other wrongdoing without evidence.",
  spam: "Advertising, self-promotion, or links to outside products or services.",
  shouting: "Written mostly in capital letters.",
};

const CONDUCT_INSTRUCTIONS = "Does the comment break the discussion rules? Judge only the comment, in whatever language it is written.";

// Jev reads Sinhala and Tamil script well but misses insults in romanised text (Singlish, Tanglish): in testing it
// caught 4 of 9 romanised insults as written, and 9 of 9 once the text was converted to Sinhala or Tamil script.
// So the first call also asks whether a Latin-script comment is English; anything that isn't clearly English is
// converted (OpenAI) and checked a second time. Asking "is it English?" works better than "is it Singlish?": English
// sentences score 0.98+, while single Sinhala words score 0.4–0.8 on both questions. English and native-script
// comments stay at one Jev call. A short word list backs this up for slang the conversion gets wrong.
const ENGLISH = "The comment is written in English (names, numbers and links aside).";
const ENGLISH_FROM = 0.9;
// Text already in Sinhala (U+0D80–0DFF) or Tamil (U+0B80–0BFF) script never needs converting.
const NATIVE_SCRIPT = /[\u0D80-\u0DFF\u0B80-\u0BFF]/;
// After conversion, civil comments scored 0.79 or higher and insults 0.47 or lower, so the line sits higher there.
const CIVIL_BELOW_CONVERTED = 0.6;
const TRANSLITERATE =
  "If the comment is Sinhala or Tamil written in English letters (Singlish or Tanglish), rewrite it in Sinhala or Tamil script, " +
  "keeping every word's meaning, including slang and swear words, and leaving English words in English. Otherwise return it unchanged. Return only the text.";

const KIND = {
  question: "Asks a question or requests clarification about the proposal.",
  concern: "Raises a concern, risk, objection or problem with the proposal.",
  suggestion: "Suggests a change, addition or alternative to the proposal.",
  support: "Expresses support, agreement or thanks.",
  comment: "Any other remark.",
};

const RELEVANCE = [
  "Unrelated to the proposal.",
  "Barely related to the proposal.",
  "Loosely related to the proposal.",
  "Related to the proposal.",
  "Directly about the proposal and its details.",
];

// Flag when Jev thinks the comment more likely breaks a rule than not. The probability is often split between
// related rules (abusive vs. personal attack), so compare against "none" rather than any single rule.
const CIVIL_BELOW = 0.5;
// Below this relevance (0–100) a comment is treated as off-topic.
const OFFTOPIC_BELOW = 20;
// How sure Jev must be that a comment repeats an existing insight before joining it.
const MATCH_MIN_PROBABILITY = 0.6;

export type ProposalText = { title: string; summary: string; body: string };
export type CommentCheck = {
  flag: string | null;
  kind: "question" | "concern" | "suggestion" | "support" | "comment" | "offtopic";
  relevance: number;
  offtopic: boolean;
};

export async function checkComment(proposal: ProposalText, text: string, replyingTo?: string): Promise<CommentCheck | null> {
  const latinOnly = !NATIVE_SCRIPT.test(text);
  const first = await askJev(proposal, text, replyingTo, latinOnly, CIVIL_BELOW);
  if (!first) return null;
  if (latinOnly && hasRomanisedProfanity(text)) return { ...first.check, flag: first.check.flag ?? FLAG_LABELS.abusive };
  if (!latinOnly || first.english >= ENGLISH_FROM) return first.check;
  const native = await summarise(TRANSLITERATE, text);
  if (!native || native.trim() === text.trim()) return first.check;
  const second = await askJev(proposal, native, replyingTo, false, CIVIL_BELOW_CONVERTED);
  return second?.check ?? first.check;
}

async function askJev(proposal: ProposalText, text: string, replyingTo: string | undefined, detectEnglish: boolean, civilBelow: number) {
  const r = await systemOne(
    {
      proposal: { title: proposal.title, summary: proposal.summary, text: proposal.body },
      ...(replyingTo ? { replying_to: replyingTo } : {}),
      comment: text,
    },
    {
      conduct: { type: "choice", instructions: CONDUCT_INSTRUCTIONS, criteria: CONDUCT },
      relevance: { type: "score", instructions: replyingTo ? "How closely does the comment relate to the proposal or the comment it replies to?" : "How closely does the comment relate to the proposal?", criteria: RELEVANCE },
      kind: { type: "choice", instructions: "What kind of point does the comment make about the proposal?", criteria: KIND },
      ...(detectEnglish ? { english: { type: "noul" as const, instructions: ENGLISH } } : {}),
    },
  );
  if (!r) return null;
  const conduct = r.answers.conduct as ChoiceAnswer;
  const rel = r.answers.relevance as ScoreAnswer;
  const kind = r.answers.kind as ChoiceAnswer;
  const probs = conduct.probabilities;
  const worst = Object.entries(probs).filter(([k]) => k !== "none").sort((a, b) => b[1] - a[1])[0];
  const flagKey = (probs.none ?? 0) < civilBelow && worst ? (worst[0] as keyof typeof FLAG_LABELS) : null;
  const relevance = Math.round((rel.score / (RELEVANCE.length - 1)) * 100);
  const offtopic = relevance < OFFTOPIC_BELOW;
  const check: CommentCheck = {
    flag: flagKey ? FLAG_LABELS[flagKey] : null,
    kind: offtopic ? "offtopic" : (kind.choice as CommentCheck["kind"]),
    relevance,
    offtopic,
  };
  return { check, english: (r.answers.english as NoulAnswer | undefined)?.noul ?? 1 };
}

export type InsightKind = "concern" | "suggestion" | "clarification";
export const insightKindFor = (kind: CommentCheck["kind"] | null): InsightKind | null =>
  kind === "question" ? "clarification" : kind === "concern" || kind === "suggestion" ? kind : null;

/** Returns the id of an existing insight the comment repeats, or null when it raises a new point. */
export async function matchInsight(text: string, existing: { id: string; text: string }[]): Promise<string | null> {
  if (existing.length === 0) return null;
  const criteria: Record<string, string> = { new: "None of these. The comment raises a different point." };
  existing.slice(0, 200).forEach((ins, i) => (criteria[`i${i}`] = ins.text));
  const r = await systemOne(
    { comment: text },
    { match: { type: "choice", instructions: "Which of these points does the comment raise? Pick one only if it makes essentially the same point.", criteria } },
  );
  const a = r?.answers.match as ChoiceAnswer | undefined;
  if (!a || a.choice === "new" || a.confidence < MATCH_MIN_PROBABILITY) return null;
  return existing[Number(a.choice.slice(1))]?.id ?? null;
}

/** One-line insight text. Falls back to the comment itself if OpenAI isn't available. */
export async function insightText(kind: InsightKind, comment: string, proposalTitle: string) {
  const fallback = comment.length > 110 ? comment.slice(0, 107) + "…" : comment;
  const style =
    kind === "clarification"
      ? "Write it as the question being asked."
      : kind === "concern"
        ? "Write it as a short statement of the concern."
        : "Write it as a short imperative suggestion, like 'Reserve some beds for long-term care'.";
  const text = await summarise(
    `You turn comments on a public policy proposal into one-line insights for the proposal's author. ${style} ` +
      "Keep it under 15 words, specific and neutral. Don't name people. Write in the same language as the comment.",
    `Proposal: ${proposalTitle}\nComment: ${comment}`,
  );
  // The model occasionally returns an Arabic question mark (؟) for non-Arabic questions.
  return text?.trim().replace(/؟/g, "?") || fallback;
}
