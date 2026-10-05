// Usage: tsx --conditions=react-server scripts/strengths.mts [--dry] [email...]
// Recalculates people's strengths with Jev (all people, or the given emails). --dry prints the scores without saving.
import "dotenv/config";
import { inArray } from "drizzle-orm";
import { db } from "../src/db";
import { users } from "../src/db/schema";
import { getStreams } from "../src/lib/data";
import { activityOf, isEmpty, jevStrengths, refreshStrengths } from "../src/lib/strengths";

const args = process.argv.slice(2);
const dry = args.includes("--dry");
const emails = args.filter((a) => !a.startsWith("--"));
const people = await db.select({ id: users.id, name: users.name }).from(users).where(emails.length ? inArray(users.email, emails) : undefined);
const streams = await getStreams();
const name = (id: string) => streams.find((s) => s.id === id)?.name ?? id;
for (const p of people) {
  let scores: Record<string, { score: number; confidence: number }> | null;
  if (dry) {
    const a = await activityOf(p.id, streams);
    scores = isEmpty(a) ? {} : await jevStrengths(a, streams);
    console.log(`\n${p.name}: ${a.proposals_written.length} proposals, ${a.comments.length} comments, ${a.following.length} follows, ${a.upvoted_insights.length} upvotes`);
  } else {
    const r = await refreshStrengths(p.id);
    scores = r.ok ? r.scores : null;
    console.log(`\n${p.name}`);
  }
  if (!scores) { console.log("  Jev unavailable"); continue; }
  for (const [k, v] of Object.entries(scores).sort((a, b) => b[1].score - a[1].score)) console.log(`  ${name(k).padEnd(16)} ${v.score.toFixed(1).padStart(4)}  (conf ${v.confidence.toFixed(2)})`);
}
process.exit(0);
