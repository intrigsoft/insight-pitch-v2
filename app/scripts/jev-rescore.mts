// Re-scores every published proposal's streams with Jev, using its latest version.
// Run with: npm run jev:rescore   (needs TYPESAFE_API_KEY in .env)
import "dotenv/config";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../src/db";
import { proposalStreams, proposalVersions, proposals, streams } from "../src/db/schema";
import { getSettings } from "../src/lib/settings";
import { jevConfigured, scoreWithJev } from "../src/lib/jev";

if (!jevConfigured()) {
  console.error("TYPESAFE_API_KEY is not set; nothing to do.");
  process.exit(1);
}
const settings = await getSettings();
const all = await db.select({ id: proposals.id }).from(proposals);
let done = 0;
for (const { id } of all) {
  const [latest] = await db.select().from(proposalVersions).where(eq(proposalVersions.proposalId, id)).orderBy(desc(proposalVersions.number)).limit(1);
  if (!latest) continue;
  const rows = await db
    .select({ streamId: proposalStreams.streamId, authorScore: proposalStreams.authorScore, name: streams.name, description: streams.description })
    .from(proposalStreams)
    .innerJoin(streams, eq(streams.id, proposalStreams.streamId))
    .where(eq(proposalStreams.proposalId, id));
  if (!rows.length) continue;
  const r = await scoreWithJev(latest, rows.map((x) => ({ id: x.streamId, name: x.name, description: x.description })));
  if (!r.ok) { console.warn(`${latest.title}: ${r.reason}`); continue; }
  for (const x of rows) {
    const j = r.scores[x.streamId];
    if (!j) continue;
    const score = settings.scoredBy === "author" && x.authorScore != null ? x.authorScore : j.score;
    await db.update(proposalStreams).set({ jevScore: j.raw, jevConfidence: j.confidence, score })
      .where(and(eq(proposalStreams.proposalId, id), eq(proposalStreams.streamId, x.streamId)));
  }
  done++;
  console.log(`${latest.title}: ` + rows.map((x) => `${x.name} ${r.scores[x.streamId]?.score ?? "–"}`).join(", "));
}
console.log(`Re-scored ${done} proposals with ${settings.scoredBy === "author" ? "Jev (kept author scores as the shown score)" : "Jev"}.`);
process.exit(0);
