import "server-only";
import { createHash } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { translations } from "@/db/schema";
import { catalogEntry } from "./languages";
import { getSettings } from "./settings";

// Shared translation cache plus OpenAI (gpt-6-luna) for anything not cached yet. Every text is cached per target
// language by a hash of its exact wording, so unchanged paragraphs are never translated twice.

const MODEL = process.env.OPENAI_MODEL || "gpt-6-luna";
const BATCH = 40;
const TIMEOUT_MS = 60_000;

export const textHash = (text: string) => createHash("sha256").update(text).digest("base64url").slice(0, 22);

export type Cached = { text: string; reviewed: boolean; createdAt: Date };

/** Cached translations for these texts into `lang`, keyed by the source text. Missing texts are left out. */
export async function cachedTranslations(lang: string, texts: string[]): Promise<Map<string, Cached>> {
  const unique = [...new Set(texts.filter((t) => t && t.trim()))];
  const out = new Map<string, Cached>();
  if (!unique.length) return out;
  const byHash = new Map(unique.map((t) => [textHash(t), t]));
  const rows = await db
    .select({ hash: translations.hash, text: translations.text, reviewedAt: translations.reviewedAt, createdAt: translations.createdAt })
    .from(translations)
    .where(and(eq(translations.lang, lang), inArray(translations.hash, [...byHash.keys()])));
  for (const r of rows) out.set(byHash.get(r.hash)!, { text: r.text, reviewed: Boolean(r.reviewedAt), createdAt: r.createdAt });
  return out;
}

// One translation run per language at a time per text, so concurrent readers don't pay twice.
const inFlight = new Map<string, Promise<void>>();

/** Translates whatever isn't cached yet into `lang` and stores it. Returns false if OpenAI is unavailable or fails. */
export async function translateMissing(lang: string, texts: string[], purpose: "content" | "interface" = "content"): Promise<boolean> {
  const target = catalogEntry(lang);
  if (!target || !process.env.OPENAI_API_KEY?.trim()) return false;
  const cached = await cachedTranslations(lang, texts);
  const missing = [...new Set(texts.filter((t) => t && t.trim() && !cached.has(t)))];
  if (!missing.length) return true;

  const key = lang + ":" + textHash(missing.join("\u0000"));
  if (!inFlight.has(key)) {
    inFlight.set(
      key,
      (async () => {
        const { glossary } = await getSettings();
        for (let i = 0; i < missing.length; i += BATCH) {
          const batch = missing.slice(i, i + BATCH);
          const result = await callOpenAI(target.name, target.native, batch, glossary, purpose);
          if (!result) throw new Error("translation failed");
          await db
            .insert(translations)
            .values(batch.map((t, j) => ({ lang, hash: textHash(t), text: result[j], model: MODEL })))
            .onConflictDoNothing();
        }
      })().finally(() => inFlight.delete(key)),
    );
  }
  try {
    await inFlight.get(key);
    return true;
  } catch (e) {
    console.warn("[translate]", e instanceof Error ? e.message : e);
    return false;
  }
}

export async function machineTranslate(lang: string, texts: string[], purpose: "content" | "interface"): Promise<string[] | null> {
  const target = catalogEntry(lang);
  if (!target) return null;
  const { glossary } = await getSettings();
  return callOpenAI(target.name, target.native, texts, glossary, purpose);
}

async function callOpenAI(name: string, native: string, texts: string[], glossary: string[], purpose: "content" | "interface"): Promise<string[] | null> {
  const context =
    purpose === "interface"
      ? "These are interface labels, buttons and messages from a public consultation web app. Keep them short and natural for an app interface. Keep placeholders in curly braces, like {n} or {name}, exactly as written."
      : "This is content from a public consultation platform where citizens and officials discuss government proposals. Use a clear, neutral register suited to public administration.";
  const instructions =
    `Translate each string in the JSON array into ${name} (${native}). ${context} ` +
    "Keep all numbers, percentages, amounts, dates and units exactly as written. Keep @mentions of people unchanged. " +
    "Keep a leading '## ' marker if present. If a string is already in the target language, return it unchanged. " +
    (glossary.length ? `Never translate these terms: ${glossary.join(", ")}. ` : "") +
    "Return the translations in the same order, one per input string.";
  try {
    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: MODEL,
        input: [
          { role: "system", content: instructions },
          { role: "user", content: JSON.stringify(texts) },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "translations",
            strict: true,
            schema: {
              type: "object",
              properties: { translations: { type: "array", items: { type: "string" } } },
              required: ["translations"],
              additionalProperties: false,
            },
          },
        },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      console.warn(`[translate] OpenAI ${res.status}: ${(await res.text()).slice(0, 200)}`);
      return null;
    }
    const data = await res.json();
    const raw: string | undefined =
      data.output_text ?? data.output?.flatMap((o: { content?: { type: string; text?: string }[] }) => o.content ?? []).find((c: { type: string }) => c.type === "output_text")?.text;
    const arr = raw ? (JSON.parse(raw).translations as string[]) : null;
    if (!Array.isArray(arr) || arr.length !== texts.length) return null;
    return arr.map((t) => String(t).replace(/؟/g, (m) => (name === "Arabic" ? m : "?")));
  } catch (e) {
    console.warn("[translate] request failed:", e instanceof Error ? e.message : e);
    return null;
  }
}
