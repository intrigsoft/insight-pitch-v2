// Counting a proposal's votes against the lead's display minimum and the mandate rule. Shared by server and client.

export type Stance = "support" | "oppose";
export type MandateRule = { pct: number; votes: number };

export type Tally = {
  support: number;
  oppose: number;
  total: number;
  /** Whole-number share of support, 0–100. */
  pct: number;
  /** Whether the share is shown publicly yet. */
  shown: boolean;
  mandate: boolean;
};

export function tally(support: number, oppose: number, min: number, rule: MandateRule): Tally {
  const total = support + oppose;
  const pct = total ? Math.round((support / total) * 100) : 0;
  const shown = total > 0 && total >= min;
  return { support, oppose, total, pct, shown, mandate: shown && total >= rule.votes && pct >= rule.pct };
}
