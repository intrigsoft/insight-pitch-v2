import "server-only";
import { createHash } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { translations } from "@/db/schema";
import { catalogEntry } from "./languages";
import { getSettings } from "./settings";
import { FIDELITY_MIN, jevFidelity, problemNote } from "./translation-check";
import { leftoverScript } from "./script-check";

// Shared translation cache plus OpenAI (gpt-6-luna) for anything not cached yet. Every text is cached per target
// language by a hash of its exact wording, so unchanged paragraphs are never translated twice.

const MODEL = process.env.OPENAI_MODEL || "gpt-6-luna";
const BATCH = 40;
const TIMEOUT_MS = 60_000;

export const textHash = (text: string) => createHash("sha256").update(text).digest("base64url").slice(0, 22);

export type Cached = { text: string; reviewed: boolean; createdAt: Date; fidelity: number | null; needsCheck: boolean };

/** Cached translations for these texts into `lang`, keyed by the source text. Missing texts are left out. */
export async function cachedTranslations(lang: string, texts: string[]): Promise<Map<string, Cached>> {
  const unique = [...new Set(texts.filter((t) => t && t.trim()))];
  const out = new Map<string, Cached>();
  if (!unique.length) return out;
  const byHash = new Map(unique.map((t) => [textHash(t), t]));
  const rows = await db
    .select({ hash: translations.hash, text: translations.text, reviewedAt: translations.reviewedAt, createdAt: translations.createdAt, fidelity: translations.fidelity, checkNote: translations.checkNote })
    .from(translations)
    .where(and(eq(translations.lang, lang), inArray(translations.hash, [...byHash.keys()])));
  for (const r of rows)
    out.set(byHash.get(r.hash)!, {
      text: r.text,
      reviewed: Boolean(r.reviewedAt),
      createdAt: r.createdAt,
      fidelity: r.fidelity,
      // Flagged when the automatic check still found a problem after the retry (and no person has reviewed it).
      needsCheck: !r.reviewedAt && (Boolean(r.checkNote) || (r.fidelity != null && r.fidelity < FIDELITY_MIN)),
    });
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
          const checked = purpose === "content" ? await checkAndRetry(lang, target.name, target.native, batch, result, glossary) : batch.map((_, j) => ({ text: result[j], fidelity: null, note: null }));
          await db
            .insert(translations)
            .values(batch.map((t, j) => ({ lang, hash: textHash(t), text: checked[j].text, model: MODEL, fidelity: checked[j].fidelity, checkNote: checked[j].note })))
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

type Checked = { text: string; fidelity: number | null; note: string | null };

/** Runs the script check and Jev on each translation; anything that fails is translated once more with the problem named. */
async function checkAndRetry(lang: string, name: string, native: string, sources: string[], out: string[], glossary: string[]): Promise<Checked[]> {
  const check = async (src: string, text: string) => {
    const leftover = leftoverScript(src, text, lang);
    const f = await jevFidelity(src, text, name);
    return { f, note: problemNote(f, leftover) };
  };
  const first = await mapLimit(sources, 6, (src, j) => check(src, out[j]));
  const retryIdx = first.map((c, j) => (c.note ? j : -1)).filter((j) => j >= 0);
  const final: Checked[] = first.map((c, j) => ({ text: out[j], fidelity: c.f?.score ?? null, note: c.note }));
  if (!retryIdx.length) return final;
  await mapLimit(retryIdx, 6, async (j) => {
    const again = await callOpenAI(name, native, [sources[j]], glossary, "content", first[j].note!);
    if (!again) return;
    const c = await check(sources[j], again[0]);
    // Keep whichever version Jev rates higher; the note records any problem that remains for human review.
    if ((c.f?.score ?? 0) >= (first[j].f?.score ?? 0)) final[j] = { text: again[0], fidelity: c.f?.score ?? null, note: c.note };
  });
  return final;
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  }));
  return out;
}

export async function machineTranslate(lang: string, texts: string[], purpose: "content" | "interface"): Promise<string[] | null> {
  const target = catalogEntry(lang);
  if (!target) return null;
  const { glossary } = await getSettings();
  return callOpenAI(target.name, target.native, texts, glossary, purpose);
}

async function callOpenAI(name: string, native: string, texts: string[], glossary: string[], purpose: "content" | "interface", fixNote?: string): Promise<string[] | null> {
  const context =
    purpose === "interface"
      ? "These are interface labels, buttons and messages from a public consultation web app. Keep them short and natural for an app interface. Keep placeholders in curly braces, like {n} or {name}, exactly as written."
      : "This is content from a public consultation platform where citizens and officials discuss government proposals. Use a clear, neutral register suited to public administration.";
  const instructions =
    `Translate each string in the JSON array into ${name} (${native}). ${context} ` +
    "Keep every number, percentage and date value exactly as written, but translate the words around them, including currency and unit words (for example 'million', 'rupees', 'km'). Keep @mentions of people unchanged. " +
    "Keep a leading '## ' marker if present. If a string is already in the target language, return it unchanged. " +
    (glossary.length ? `Never translate these terms: ${glossary.join(", ")}. ` : "") +
    "Return the translations in the same order, one per input string." +
    (fixNote ? ` A previous translation of this text had a problem: ${fixNote} Correct it.` : "");
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
