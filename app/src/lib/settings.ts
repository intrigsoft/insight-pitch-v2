import "server-only";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { DEFAULT_SETTINGS } from "@/db/seed-data";
import type { Scale } from "./scale";

export type ScoredBy = "author" | "reviewers" | "both";
export type AppSettings = { scale: Scale; scoredBy: ScoredBy; requireStream: boolean; showPublic: boolean };

export async function getSettings(): Promise<AppSettings> {
  const rows = await db.select().from(settings);
  const out: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const r of rows) out[r.key] = r.value;
  return out as AppSettings;
}
