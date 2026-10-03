import "server-only";
import { systemOne, type NoulAnswer, type ScoreAnswer } from "./jev";
export { leftoverScript } from "./script-check";

// Checks a machine translation before it's cached:
// 1. Script check (instant): words left in the source language's script, such as Tamil inside a Sinhala translation.
// 2. Jev (one call per section): how faithfully the translation keeps the original's meaning, facts and numbers.
// Tested on Sinhala and Tamil: good translations scored 3.5–3.8 out of 4; a changed amount, a dropped sentence, a
// reversed meaning and a wrong paragraph scored 0.1–1.95. Below FIDELITY_MIN a section is retried once.

export const FIDELITY_MIN = 2.5;

const RUBRIC = [
  "0: Unrelated or mostly wrong.",
  "1: Major errors: key facts, numbers or meaning differ, or large parts are missing.",
  "2: Noticeable errors: some facts or meaning differ, or something is missing or added.",
  "3: Minor issues only: wording or style, meaning intact.",
  "4: Faithful and complete: same meaning, facts and numbers as the original.",
];

export type Fidelity = { score: number; numbersOk: boolean; complete: boolean };

/** Jev's view of one translation, or null when Jev isn't available. */
export async function jevFidelity(original: string, translation: string, targetName: string): Promise<Fidelity | null> {
  const r = await systemOne(
    { original, translation: { language: targetName, text: translation } },
    {
      fidelity: { type: "score", instructions: "How faithfully does the translation convey the original's meaning, facts and numbers?", criteria: RUBRIC },
      numbers: { type: "noul", instructions: "Every number, amount, percentage and unit in the original appears with the same value in the translation." },
      complete: { type: "noul", instructions: "The translation includes everything the original says, with nothing missing or added." },
    },
  );
  if (!r) return null;
  return {
    score: (r.answers.fidelity as ScoreAnswer).score,
    numbersOk: (r.answers.numbers as NoulAnswer).noul >= 0.5,
    complete: (r.answers.complete as NoulAnswer).noul >= 0.5,
  };
}

/** What to tell the translator on a retry, or null if the translation passed. */
export function problemNote(f: Fidelity | null, leftover: string | null): string | null {
  const notes: string[] = [];
  if (leftover) notes.push(leftover);
  if (f && f.score < FIDELITY_MIN) {
    if (!f.numbersOk) notes.push("A number or amount didn't match the original.");
    if (!f.complete) notes.push("Something from the original was missing or something was added.");
    if (f.numbersOk && f.complete) notes.push("The meaning differed from the original.");
  }
  return notes.length ? notes.join(" ") : null;
}
