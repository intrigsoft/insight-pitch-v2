// Scores every proposal's insights for relevance to its latest version (only those not yet judged against it).
// Usage: npm run insights:relevance [-- --all]   --all judges every insight again.
import "dotenv/config";
import { eq, sql } from "drizzle-orm";
import { db } from "../src/db";
import { insights, proposalVersions, proposals } from "../src/db/schema";
import { scoreInsights } from "../src/lib/insight-relevance";

if (process.argv.includes("--all")) await db.update(insights).set({ relevanceVersion: null });
const ids = await db.selectDistinct({ id: proposals.id }).from(proposals).innerJoin(proposalVersions, eq(proposalVersions.proposalId, proposals.id));
for (const { id } of ids) await scoreInsights(id);
const rows = await db.select({ kind: insights.kind, text: insights.text, relevance: insights.relevance }).from(insights).orderBy(sql`relevance desc nulls last`);
for (const r of rows) console.log(String(r.relevance ?? "—").padStart(3), r.kind.padEnd(13), r.text);
process.exit(0);
