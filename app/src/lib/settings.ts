import "server-only";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { DEFAULT_SETTINGS } from "@/db/seed-data";
import type { Scale } from "./scale";

export type ScoredBy = "author" | "reviewers" | "both";
export type AppSettings = {
  scale: Scale;
  scoredBy: ScoredBy;
  requireStream: boolean;
  showPublic: boolean;
  defaultLanguage: string;
  txOnPublish: boolean;
  txComments: boolean;
  txLabel: boolean;
  glossary: string[];
};

const asBool = (v: unknown, fallback: boolean) => (typeof v === "boolean" ? v : v === "true" ? true : v === "false" ? false : fallback);

// The driver can hand back JSON scalars re-parsed ("10" arrives as 10), so coerce each value.
export async function getSettings(): Promise<AppSettings> {
  const raw = Object.fromEntries((await db.select().from(settings)).map((r) => [r.key, r.value]));
  const scale = String(raw.scale ?? DEFAULT_SETTINGS.scale);
  const scoredBy = String(raw.scoredBy ?? DEFAULT_SETTINGS.scoredBy);
  return {
    scale: (["5", "10", "100"].includes(scale) ? scale : DEFAULT_SETTINGS.scale) as Scale,
    scoredBy: (["author", "reviewers", "both"].includes(scoredBy) ? scoredBy : DEFAULT_SETTINGS.scoredBy) as ScoredBy,
    requireStream: asBool(raw.requireStream, DEFAULT_SETTINGS.requireStream),
    showPublic: asBool(raw.showPublic, DEFAULT_SETTINGS.showPublic),
    defaultLanguage: typeof raw.defaultLanguage === "string" ? raw.defaultLanguage : DEFAULT_SETTINGS.defaultLanguage,
    txOnPublish: asBool(raw.txOnPublish, DEFAULT_SETTINGS.txOnPublish),
    txComments: asBool(raw.txComments, DEFAULT_SETTINGS.txComments),
    txLabel: asBool(raw.txLabel, DEFAULT_SETTINGS.txLabel),
    glossary: Array.isArray(raw.glossary) ? (raw.glossary as unknown[]).map(String) : DEFAULT_SETTINGS.glossary,
  };
}
