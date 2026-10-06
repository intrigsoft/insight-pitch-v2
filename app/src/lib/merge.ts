// Three-way merge of proposals, paragraph by paragraph, for change requests.
//
// A document is a list of blocks: the title and summary (as "@@title …" and "@@summary …") followed by the body's
// paragraphs. A change request was written from a published version (the base); since then the lead may have changed
// their draft ("ours"), and the request changes the base its own way ("theirs"). Runs of blocks only the request
// changed merge cleanly; runs both changed are conflicts the lead resolves.
//
// Shared by the review screen (in the browser) and the merge action (on the server), so both see the same changes.

import { parseBody, plainInline } from "./body";

export type Doc = { title: string; summary: string; body: string };

export const splitBlocks = (body: string) =>
  (body || "")
    .split(/\n\s*\n/)
    .map((x) => x.trim())
    .filter(Boolean);

export const docBlocks = (d: Doc) => ["@@title " + (d.title || ""), "@@summary " + (d.summary || ""), ...splitBlocks(d.body)];

export function fromBlocks(arr: string[], fallback: Doc): Doc {
  const t = arr.find((x) => x.startsWith("@@title "));
  const s = arr.find((x) => x.startsWith("@@summary "));
  return {
    title: t ? t.slice(8) : fallback.title,
    summary: s ? s.slice(10) : fallback.summary,
    body: arr.filter((x) => !x.startsWith("@@")).join("\n\n"),
  };
}

function lcsTable<T>(a: T[], b: T[]) {
  const n = a.length, m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  return dp;
}

/** For each block of `a`, the index of the matching block in `b` (longest common subsequence), or -1. */
function lcsMap(a: string[], b: string[]) {
  const dp = lcsTable(a, b);
  const map = new Array<number>(a.length).fill(-1);
  let i = 0, j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { map[i] = j; i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  return map;
}

export type Chunk = {
  /** same: nobody changed it. ours: only the lead changed it (or both made the same change). theirs: only the request did. */
  kind: "same" | "ours" | "theirs" | "conflict";
  base: string[];
  ours: string[];
  theirs: string[];
  /** Index among the chunks the lead decides on (theirs and conflict). */
  idx?: number;
};

const eq = (x: string[], y: string[]) => x.length === y.length && x.every((v, i) => v === y[i]);
const kindOf = (b: string[], o: string[], t: string[]): Chunk["kind"] =>
  eq(o, b) && eq(t, b) ? "same" : eq(o, b) ? "theirs" : eq(t, b) || eq(o, t) ? "ours" : "conflict";

const metaOf = (x: string) => (x.startsWith("@@title ") ? "t" : x.startsWith("@@summary ") ? "s" : "");
/** The block in `arr` from `from` on that is an edited version of `x`, or -1. */
function similarIn(x: string, arr: string[], from: number) {
  for (let q = from; q < arr.length; q++) if (metaOf(arr[q]) === metaOf(x) && similarity(x, arr[q]) >= 0.4) return q;
  return -1;
}

/**
 * Splits a changed run around base paragraphs that both sides edited, so that paragraphs only one side added
 * next to them aren't swept into the conflict (and lost if the lead picks the other version).
 */
function refine(b: string[], o: string[], t: string[]): Chunk[] {
  const kind = kindOf(b, o, t);
  if (kind !== "conflict" || !b.length) return [{ kind, base: b, ours: o, theirs: t }];
  for (let i = 0; i < b.length; i++) {
    const oj = similarIn(b[i], o, 0), tj = similarIn(b[i], t, 0);
    if (oj < 0 || tj < 0) continue;
    const parts = [
      ...refine(b.slice(0, i), o.slice(0, oj), t.slice(0, tj)),
      { kind: kindOf([b[i]], [o[oj]], [t[tj]]), base: [b[i]], ours: [o[oj]], theirs: [t[tj]] },
      ...refine(b.slice(i + 1), o.slice(oj + 1), t.slice(tj + 1)),
    ];
    return parts.filter((c) => c.base.length || c.ours.length || c.theirs.length);
  }
  return [{ kind, base: b, ours: o, theirs: t }];
}

export function merge3(B: string[], O: string[], T: string[]): Chunk[] {
  const mo = lcsMap(B, O), mt = lcsMap(B, T);
  const out: Chunk[] = [];
  let bi = 0, oi = 0, ti = 0;
  for (let i = 0; i <= B.length; i++) {
    const end = i === B.length;
    // Anchor on base blocks both sides kept unchanged.
    if (!end && !(mo[i] >= 0 && mt[i] >= 0)) continue;
    const oj = end ? O.length : mo[i], tj = end ? T.length : mt[i];
    const b = B.slice(bi, i), o = O.slice(oi, oj), t = T.slice(ti, tj);
    if (b.length || o.length || t.length) out.push(...refine(b, o, t));
    if (!end) out.push({ kind: "same", base: [B[i]], ours: [O[oj]], theirs: [T[tj]] });
    bi = i + 1; oi = oj + 1; ti = tj + 1;
  }
  let n = 0;
  for (const ch of out) if (ch.kind === "theirs" || ch.kind === "conflict") ch.idx = n++;
  return out;
}

/** Merges a change request into the lead's current content (their draft, or the latest version). */
export function mergeRequest(base: Doc, ours: Doc, theirs: Doc) {
  const chunks = merge3(docBlocks(base), docBlocks(ours), docBlocks(theirs));
  return { chunks, hunks: chunks.filter((c) => c.idx != null) };
}

/** accept/reject for clean changes; mine/theirs/edit for conflicts. */
export type Decision = "accept" | "reject" | "mine" | "theirs" | "edit";

/** Applies the lead's decisions. Returns null if any change is undecided. */
export function applyDecisions(chunks: Chunk[], dec: Record<number, Decision>, edits: Record<number, string>, ours: Doc) {
  const out: string[] = [];
  let accepted = 0, total = 0;
  for (const ch of chunks) {
    if (ch.idx == null) { out.push(...ch.ours); continue; }
    total++;
    const d = dec[ch.idx];
    if (!d) return null;
    if (ch.kind === "theirs") {
      if (d === "accept") { out.push(...ch.theirs); accepted++; }
      else out.push(...ch.ours);
    } else if (d === "theirs") { out.push(...ch.theirs); accepted++; }
    else if (d === "edit") {
      const text = edits[ch.idx] ?? "";
      // A combined title or summary stays a single line.
      const meta = (ch.base[0] || ch.ours[0] || ch.theirs[0] || "").match(/^@@(title|summary) /);
      out.push(...(meta ? [meta[0] + text.replace(/\s*\n\s*/g, " ").trim()] : splitBlocks(text)));
      accepted++;
    } else out.push(...ch.ours);
  }
  return { doc: fromBlocks(out, ours), accepted, total };
}

/* Display */

export type DiffPart = { text: string; kind: "same" | "del" | "add" };

/** Word-level diff, for showing what changed inside a paragraph. */
export function wordDiff(a: string, b: string): DiffPart[] {
  const A = a.split(/(\s+)/).filter((x) => x !== ""), Bw = b.split(/(\s+)/).filter((x) => x !== "");
  if (A.length * Bw.length > 60000) return [{ text: a, kind: "del" }, { text: "\n" + b, kind: "add" }];
  const dp = lcsTable(A, Bw);
  const out: DiffPart[] = [];
  const push = (text: string, kind: DiffPart["kind"]) => {
    const l = out[out.length - 1];
    if (l && l.kind === kind) l.text += text;
    else out.push({ text, kind });
  };
  let i = 0, j = 0;
  while (i < A.length && j < Bw.length) {
    if (A[i] === Bw[j]) { push(A[i], "same"); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { push(A[i], "del"); i++; }
    else { push(Bw[j], "add"); j++; }
  }
  while (i < A.length) push(A[i++], "del");
  while (j < Bw.length) push(Bw[j++], "add");
  return out;
}

function similarity(a: string, b: string) {
  const w = (s: string) => new Set(s.toLowerCase().split(/\W+/).filter(Boolean));
  const A = w(a), B = w(b);
  let c = 0;
  A.forEach((x) => { if (B.has(x)) c++; });
  return c / Math.max(1, A.size, B.size);
}

/** How a raw block reads in the review: the title or summary with a label, a heading, or plain text. */
export type Shown = { meta?: "title" | "summary"; heading?: boolean; text: string };

export function showBlock(raw: string, labels: { image: string; video: string; file: string }): Shown {
  if (raw.startsWith("@@title ")) return { meta: "title", text: raw.slice(8) };
  if (raw.startsWith("@@summary ")) return { meta: "summary", text: raw.slice(10) };
  const b = parseBody(raw)[0] ?? { type: "p" as const, text: raw };
  switch (b.type) {
    case "h": return { heading: true, text: b.text };
    case "ul": return { text: b.items.map((x) => "• " + plainInline(x)).join("\n") };
    case "ol": return { text: b.items.map((x, i) => `${i + 1}. ${plainInline(x)}`).join("\n") };
    case "table": return { text: b.rows.map((r) => r.join("  ·  ")).join("\n") };
    case "image": return { text: `${labels.image}: ${b.caption || b.alt}` };
    case "video": return { text: `${labels.video}: ${b.title || b.url}` };
    case "file": return { text: `${labels.file}: ${b.name}` };
    case "quote": return { text: plainInline(b.text) };
    default: return { text: plainInline(b.text) };
  }
}

export type HunkLabel =
  | { kind: "title" | "summary" | "newSection" | "editedAdded" }
  | { kind: "added" | "removed" | "edited"; n: number };

export function hunkLabel(base: string[], theirs: string[]): HunkLabel {
  const m = [...base, ...theirs].find((x) => x.startsWith("@@"));
  if (m) return { kind: m.startsWith("@@title") ? "title" : "summary" };
  if (!base.length) return theirs.some((x) => x.startsWith("## ")) ? { kind: "newSection" } : { kind: "added", n: theirs.length };
  if (!theirs.length) return { kind: "removed", n: base.length };
  return theirs.length > base.length ? { kind: "editedAdded" } : { kind: "edited", n: base.length };
}

export type HunkRow = { mark: "add" | "del" | "edit"; shown: Shown; parts: DiffPart[] };

/** Rows of a clean change: removed and added blocks, with edited paragraphs paired up and diffed word by word. */
export function hunkRows(base: string[], theirs: string[], labels: Parameters<typeof showBlock>[1]): HunkRow[] {
  const rows: HunkRow[] = [];
  const row = (raw: string, mark: "add" | "del"): HunkRow => {
    const shown = showBlock(raw, labels);
    return { mark, shown, parts: [{ text: shown.text, kind: "same" }] };
  };
  let j = 0;
  for (const x of base) {
    const dx = showBlock(x, labels);
    let k = -1;
    if (!dx.heading)
      for (let q = j; q < theirs.length; q++) {
        const dq = showBlock(theirs[q], labels);
        if (!dq.heading && dq.meta === dx.meta && similarity(dx.text, dq.text) >= 0.4) { k = q; break; }
      }
    if (k < 0) { rows.push(row(x, "del")); continue; }
    for (; j < k; j++) rows.push(row(theirs[j], "add"));
    const dq = showBlock(theirs[k], labels);
    rows.push({ mark: "edit", shown: { meta: dx.meta, text: dq.text }, parts: wordDiff(dx.text, dq.text) });
    j = k + 1;
  }
  for (; j < theirs.length; j++) rows.push(row(theirs[j], "add"));
  return rows;
}
