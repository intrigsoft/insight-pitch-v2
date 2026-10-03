import "server-only";

// Writes short insight summaries with OpenAI (Responses API, structured output). Jev can't generate text.
const MODEL = process.env.OPENAI_MODEL || "gpt-6-luna";
const TIMEOUT_MS = 15_000;

export function openaiConfigured() {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

/** Returns one line of text, or null when OpenAI isn't configured or the call fails. */
export async function summarise(instructions: string, input: string): Promise<string | null> {
  if (!openaiConfigured()) return null;
  try {
    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: MODEL,
        input: [
          { role: "system", content: instructions },
          { role: "user", content: input },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "insight",
            strict: true,
            schema: { type: "object", properties: { text: { type: "string" } }, required: ["text"], additionalProperties: false },
          },
        },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      console.warn(`[openai] ${res.status}: ${(await res.text()).slice(0, 200)}`);
      return null;
    }
    const data = await res.json();
    const raw: string | undefined =
      data.output_text ?? data.output?.flatMap((o: { content?: { type: string; text?: string }[] }) => o.content ?? []).find((c: { type: string }) => c.type === "output_text")?.text;
    return raw ? (JSON.parse(raw).text as string) : null;
  } catch (e) {
    console.warn("[openai] request failed:", e instanceof Error ? e.message : e);
    return null;
  }
}
