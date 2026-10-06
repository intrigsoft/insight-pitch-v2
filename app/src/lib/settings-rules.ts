/** Allowed values for the mandate rule (shared with the settings screen). */
export const MANDATE_PCT = { min: 50, max: 90, step: 5 } as const;
export const MANDATE_VOTES = { min: 10, max: 5000, step: 1 } as const;
export const validMandate = (v: unknown, r: { min: number; max: number; step: number }) =>
  typeof v === "number" && Number.isInteger(v) && v >= r.min && v <= r.max && (v - r.min) % r.step === 0;
