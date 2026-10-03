// Runs Jev over visible comments that have no analysis yet and adds their points to the proposal's insights.
// Run with: npm run comments:analyze   (needs TYPESAFE_API_KEY; OPENAI_API_KEY for new insight summaries)
import "dotenv/config";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "../src/db";
import { comments } from "../src/db/schema";
import { addToInsights } from "../src/lib/discussion";
import { jevConfigured } from "../src/lib/jev";

if (!jevConfigured()) {
  console.error("TYPESAFE_API_KEY is not set; nothing to do.");
  process.exit(1);
}
const todo = await db.select({ id: comments.id, body: comments.body }).from(comments).where(and(eq(comments.status, "visible"), isNull(comments.kind)));
for (const c of todo) {
  await addToInsights(c.id);
  const [after] = await db.select({ kind: comments.kind, relevance: comments.relevance }).from(comments).where(eq(comments.id, c.id));
  console.log(`${after.kind ?? "–"} ${after.relevance ?? "–"}  ${c.body.slice(0, 70)}`);
}
console.log(`Analysed ${todo.length} comments.`);
process.exit(0);
