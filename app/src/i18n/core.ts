import { en, type MessageKey, type Messages } from "./en";

export type Vars = Record<string, string | number>;
export type T = (key: MessageKey, vars?: Vars) => string;
export type TN = (key: string, n: number, vars?: Vars) => string;

const fill = (s: string, vars?: Vars) => (vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s);

/** Builds t() and tn() over a message set, falling back to English for anything missing. */
export function makeT(messages: Partial<Messages>) {
  const t: T = (key, vars) => fill(messages[key] ?? en[key] ?? key, vars);
  // Plural keys are "<key>.one" and "<key>.other".
  const tn: TN = (key, n, vars) => t(`${key}.${n === 1 ? "one" : "other"}` as MessageKey, { n, ...vars });
  return { t, tn };
}
