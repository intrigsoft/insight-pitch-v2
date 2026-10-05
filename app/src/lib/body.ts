// Proposal bodies are stored as text, one block per paragraph, separated by blank lines:
//
//   ## Heading
//   A paragraph with **bold**, *italic* and [links](https://example.org).
//   > A quote
//   - Bulleted item            1. Numbered item
//   | Header | Header |       (first row is the header)
//   | Cell   | Cell   |
//   ::image <upload id> | caption | alt text | size
//   ::video <YouTube or Vimeo URL> | title | duration
//   ::file <upload id> | file name | size
//
// Shared by the editor (in the browser) and the server, so keep it free of server-only imports.

export type Block =
  | { type: "h"; text: string }
  | { type: "p"; text: string }
  | { type: "quote"; text: string }
  | { type: "ul" | "ol"; items: string[] }
  | { type: "table"; rows: string[][] }
  | { type: "image"; id: string; caption: string; alt: string; size: string }
  | { type: "video"; url: string; title: string; dur: string }
  | { type: "file"; id: string; name: string; size: string };

export const VIDEO_RE = /^https?:\/\/(www\.|m\.)?(youtube\.com|youtu\.be|vimeo\.com)\/\S+/i;
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
export const FILE_ACCEPT = ".pdf,.xlsx,.xls,.csv,.ods,.docx,.doc,.odt,.pptx";
/** Cookie remembering a reader's "Text only" choice (images hidden). */
export const TEXT_ONLY_COOKIE = "ip_text_only";
export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

const cellsOf = (l: string) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());

export function parseBody(body: string): Block[] {
  return (body || "")
    .split(/\n\s*\n/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t): Block => {
      if (t.startsWith("## ")) return { type: "h", text: t.slice(3) };
      const m = t.match(/^::(image|video|file)\s+([\s\S]*)$/);
      if (m) {
        const f = m[2].split("|").map((x) => x.trim());
        if (m[1] === "image") return { type: "image", id: f[0], caption: f[1] || "", alt: f[2] || "", size: f[3] || "" };
        if (m[1] === "video") return { type: "video", url: f[0], title: f[1] || "", dur: f[2] || "" };
        return { type: "file", id: f[0], name: f[1] || "", size: f[2] || "" };
      }
      const lines = t.split("\n");
      if (lines.every((l) => /^- /.test(l))) return { type: "ul", items: lines.map((l) => l.slice(2)) };
      if (lines.every((l) => /^\d+\. /.test(l))) return { type: "ol", items: lines.map((l) => l.replace(/^\d+\. /, "")) };
      if (lines.every((l) => l.trim().startsWith("|"))) return { type: "table", rows: lines.map(cellsOf) };
      if (lines.every((l) => l.startsWith("> "))) return { type: "quote", text: lines.map((l) => l.slice(2)).join(" ") };
      return { type: "p", text: t };
    });
}

const clean = (x: string) => (x || "").replace(/\|/g, "/").replace(/\s*\n\s*/g, " ").trim();
const oneLine = (x: string) => x.trim().replace(/\s*\n\s*/g, " ");

export function toBody(blocks: Block[]): string {
  return blocks
    .map((b) => {
      switch (b.type) {
        case "h": return b.text.trim() ? "## " + oneLine(b.text) : "";
        case "quote": return b.text.trim() ? "> " + oneLine(b.text) : "";
        case "ul":
        case "ol": return b.items.map(oneLine).filter(Boolean).map((x, i) => (b.type === "ul" ? "- " : `${i + 1}. `) + x).join("\n");
        case "table": return b.rows.filter((r) => r.some((c) => (c || "").trim())).map((r) => "| " + r.map(clean).join(" | ") + " |").join("\n");
        case "image": return b.id ? "::image " + [b.id, b.caption, b.alt, b.size].map(clean).join(" | ") : "";
        case "video": return b.url.trim() ? "::video " + [b.url, b.title, b.dur].map(clean).join(" | ") : "";
        case "file": return b.id ? "::file " + [b.id, b.name, b.size].map(clean).join(" | ") : "";
        default: return (b.text || "").trim().replace(/\n\s*\n/g, "\n");
      }
    })
    .filter(Boolean)
    .join("\n\n");
}

export type Seg = { text: string; b?: boolean; i?: boolean; href?: string };

/** Splits inline markup into runs of plain, bold, italic and linked text. */
export function segs(t: string): Seg[] {
  const out: Seg[] = [];
  const re = /\*\*([^*]+)\*\*|\*([^*]+)\*|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let i = 0, m: RegExpExecArray | null;
  while ((m = re.exec(t))) {
    if (m.index > i) out.push({ text: t.slice(i, m.index) });
    if (m[1]) out.push({ text: m[1], b: true });
    else if (m[2]) out.push({ text: m[2], i: true });
    else out.push({ text: m[3], href: safeHref(m[4]) });
    i = re.lastIndex;
  }
  if (i < t.length) out.push({ text: t.slice(i) });
  return out;
}

export function safeHref(h: string) {
  return /^(https?:|mailto:)/i.test(h) ? h : "#";
}

/** Inline markup with the markers removed, for search, AI checks and plain-text previews. */
export const plainInline = (t: string) => segs(t).map((s) => s.text).join("");

/** Every piece of text a reader sees, in order: what gets translated. */
export function bodyTexts(body: string): string[] {
  return parseBody(body)
    .flatMap((b) => {
      switch (b.type) {
        case "ul": case "ol": return b.items;
        case "table": return b.rows.flat();
        case "image": return [b.caption, b.alt];
        case "video": return [b.title];
        case "file": return [];
        default: return [b.text];
      }
    })
    .filter((x) => x && x.trim());
}

/** The body as plain text, for language detection and AI checks. Media is described in brackets. */
export function plainBody(body: string): string {
  return parseBody(body)
    .map((b) => {
      switch (b.type) {
        case "h": return b.text;
        case "ul": return b.items.map((x) => "- " + plainInline(x)).join("\n");
        case "ol": return b.items.map((x, i) => `${i + 1}. ${plainInline(x)}`).join("\n");
        case "table": return b.rows.map((r) => r.join(" | ")).join("\n");
        case "image": return `[Image: ${[b.alt, b.caption].filter(Boolean).join(". ")}]`;
        case "video": return `[Video: ${b.title || b.url}]`;
        case "file": return `[Attachment: ${b.name}]`;
        default: return plainInline(b.text);
      }
    })
    .join("\n\n");
}

export const hostOf = (u: string) => {
  try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; }
};

export const fmtSize = (n: number) => (n < 1048576 ? Math.max(1, Math.round(n / 1024)) + " KB" : (n / 1048576).toFixed(1) + " MB");

export function fileBadge(name: string) {
  const ext = ((name || "").split(".").pop() || "").toUpperCase().slice(0, 4);
  const kind = /PDF/.test(ext) ? "pdf" : /XLS|CSV|ODS/.test(ext) ? "sheet" : /DOC|ODT/.test(ext) ? "doc" : "other";
  return { ext, kind };
}

/* What changed between two versions */

export type Change =
  | { kind: "title" | "summary" | "tableAdded" | "tableRemoved" | "tableChanged" }
  | { kind: "added" | "removed"; media: "image" | "video" | "file"; n: number }
  | { kind: "section"; text: string }
  | { kind: "text"; n: number };

type Content = { title: string; summary: string; body: string };

const mediaKey = (b: Block) => (b.type === "image" || b.type === "file" ? b.id : b.type === "video" ? b.url : "");

export function changesOf(a: Content, b: Content): Change[] {
  const out: Change[] = [];
  if (a.title !== b.title) out.push({ kind: "title" });
  if (a.summary !== b.summary) out.push({ kind: "summary" });
  const A = parseBody(a.body), B = parseBody(b.body);
  for (const media of ["image", "video", "file"] as const) {
    const ka = A.filter((x) => x.type === media).map(mediaKey), kb = B.filter((x) => x.type === media).map(mediaKey);
    const added = kb.filter((k) => !ka.includes(k)).length, removed = ka.filter((k) => !kb.includes(k)).length;
    if (added) out.push({ kind: "added", media, n: added });
    if (removed) out.push({ kind: "removed", media, n: removed });
  }
  const ta = A.flatMap((x) => (x.type === "table" ? [JSON.stringify(x.rows)] : [])), tb = B.flatMap((x) => (x.type === "table" ? [JSON.stringify(x.rows)] : []));
  if (tb.length > ta.length) out.push({ kind: "tableAdded" });
  if (ta.length > tb.length) out.push({ kind: "tableRemoved" });
  if (tb.slice(0, ta.length).some((x, i) => x !== ta[i])) out.push({ kind: "tableChanged" });
  for (const x of B) if (x.type === "h" && !A.some((y) => y.type === "h" && y.text === x.text)) out.push({ kind: "section", text: x.text });
  const txt = (x: Block) => (x.type === "p" || x.type === "quote" ? JSON.stringify([x.type, x.text]) : x.type === "ul" || x.type === "ol" ? JSON.stringify([x.type, x.items]) : null);
  const at = A.map(txt).filter(Boolean), bt = B.map(txt).filter(Boolean);
  const n = bt.filter((x) => !at.includes(x)).length;
  if (n) out.push({ kind: "text", n });
  return out;
}

/** A cheap fingerprint of the content, to tell whether a saved description still matches it. */
export function contentSig(c: Content) {
  const t = c.title.trim() + "|" + c.summary.trim() + "|" + c.body;
  let h = 5381;
  for (let i = 0; i < t.length; i++) h = ((h << 5) + h + t.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36) + t.length.toString(36);
}
