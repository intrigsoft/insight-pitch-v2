// Relative time labels matching the design's copy ("2d", "Updated 2 days ago", "Saved yesterday"), in the reader's language.
import type { T, TN } from "@/i18n/core";

const MIN = 60_000, HOUR = 3_600_000, DAY = 86_400_000, WEEK = 7 * DAY;
type Fmt = { t: T; tn: TN };

const elapsed = (d: Date, now: number) => Math.max(0, now - d.getTime());

/** Compact age for comments: "Just now", "5m", "6h", "2d", "2w". */
export function shortAgo(d: Date, { t }: Fmt, now = Date.now()) {
  const ms = elapsed(d, now);
  if (ms < MIN) return t("time.justNow");
  if (ms < HOUR) return t("time.m", { n: Math.floor(ms / MIN) });
  if (ms < DAY) return t("time.h", { n: Math.floor(ms / HOUR) });
  if (ms < WEEK) return t("time.d", { n: Math.floor(ms / DAY) });
  return t("time.w", { n: Math.floor(ms / WEEK) });
}

/** Sentence-style age: "just now", "3 hours ago", "2 days ago", "1 week ago". */
export function timeAgo(d: Date, { t, tn }: Fmt, now = Date.now()) {
  const ms = elapsed(d, now);
  if (ms < MIN) return t("ago.justNow");
  if (ms < HOUR) return tn("ago.minutes", Math.floor(ms / MIN));
  if (ms < DAY) return tn("ago.hours", Math.floor(ms / HOUR));
  if (ms < WEEK) return tn("ago.days", Math.floor(ms / DAY));
  if (ms < 5 * WEEK) return tn("ago.weeks", Math.floor(ms / WEEK));
  return tn("ago.months", Math.max(1, Math.floor(ms / (30 * DAY))));
}

/** Draft save time: "just now", "3 hours ago", "yesterday", "4 days ago". */
export function savedAgo(d: Date, fmt: Fmt, now = Date.now()) {
  const ms = elapsed(d, now);
  if (ms >= DAY && ms < 2 * DAY) return fmt.t("ago.yesterday");
  return timeAgo(d, fmt, now);
}

/** Calendar date as in the design ("Sep 12"), in the reader's locale. */
export function shortDate(d: Date, locale = "en-US") {
  return d.toLocaleDateString(locale, { month: "short", day: "numeric" });
}
