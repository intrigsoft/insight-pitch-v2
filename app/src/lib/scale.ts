// Scores are stored on a 1–10 base scale; the admin "Score scale" setting changes how they display.
export type Scale = "5" | "10" | "100";

export function formatScore(n: number, scale: Scale) {
  if (scale === "5") return Math.max(1, Math.round(n / 2));
  if (scale === "100") return n * 10;
  return n;
}

export const scaleSuffix = (scale: Scale) => "/" + scale;
