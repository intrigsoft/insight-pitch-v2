// Relative time labels matching the design's copy ("2d", "Updated 2 days ago", "Saved yesterday").

const MIN = 60_000, HOUR = 3_600_000, DAY = 86_400_000, WEEK = 7 * DAY;

function elapsed(d: Date, now: number) {
  return Math.max(0, now - d.getTime());
}

/** Compact age for comments: "Just now", "5m", "6h", "2d", "2w". */
export function shortAgo(d: Date, now = Date.now()) {
  const ms = elapsed(d, now);
  if (ms < MIN) return "Just now";
  if (ms < HOUR) return `${Math.floor(ms / MIN)}m`;
  if (ms < DAY) return `${Math.floor(ms / HOUR)}h`;
  if (ms < WEEK) return `${Math.floor(ms / DAY)}d`;
  return `${Math.floor(ms / WEEK)}w`;
}

const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"} ago`;

/** Sentence-style age: "just now", "3 hours ago", "2 days ago", "1 week ago". */
export function timeAgo(d: Date, now = Date.now()) {
  const ms = elapsed(d, now);
  if (ms < MIN) return "just now";
  if (ms < HOUR) return plural(Math.floor(ms / MIN), "minute");
  if (ms < DAY) return plural(Math.floor(ms / HOUR), "hour");
  if (ms < WEEK) return plural(Math.floor(ms / DAY), "day");
  if (ms < 5 * WEEK) return plural(Math.floor(ms / WEEK), "week");
  return plural(Math.max(1, Math.floor(ms / (30 * DAY))), "month");
}

/** Draft save time: "just now", "3 hours ago", "yesterday", "4 days ago". */
export function savedAgo(d: Date, now = Date.now()) {
  const ms = elapsed(d, now);
  if (ms >= DAY && ms < 2 * DAY) return "yesterday";
  return timeAgo(d, now);
}

/** Calendar date as in the design: "Sep 12". */
export function shortDate(d: Date) {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
