// Turns a proposal body into editable HTML and back. The editor is a contenteditable element managed directly
// (not by React), like the design: text blocks are plain HTML, and media are non-editable "islands" with their
// own inputs. See lib/body.ts for the stored format.

import { fileBadge, hostOf, parseBody, segs, toBody, VIDEO_RE, type Block } from "@/lib/body";

export const TEXTY = ["P", "H2", "BLOCKQUOTE", "UL", "OL"];

export type IslandLabels = {
  moveUp: string; moveDown: string; remove: string;
  dropImage: string; caption: string; altText: string; altHelp: string;
  videoUrl: string; videoTitle: string; chooseFile: string; fileLimits: string;
  videoHint: (url: string) => [string, boolean];
  uploading: (name: string) => string;
};

const esc = (x: unknown) => String(x ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function inlineHtml(t: string) {
  return segs(t || "")
    .map((s) => (s.href ? `<a href="${esc(s.href)}">${esc(s.text)}</a>` : s.b ? `<strong>${esc(s.text)}</strong>` : s.i ? `<em>${esc(s.text)}</em>` : esc(s.text)))
    .join("");
}

export function videoHint(url: string, L: { hint: string; linked: (host: string) => string; bad: string }): [string, boolean] {
  const u = (url || "").trim();
  if (!u) return [L.hint, false];
  return VIDEO_RE.test(u) ? [L.linked(hostOf(u)), false] : [L.bad, true];
}

const ICON = {
  up: "M12 19V5M6 11l6-6 6 6",
  down: "M12 5v14M6 13l6 6 6-6",
  remove: "M6 6l12 12M18 6 6 18",
  clip: "m20 11.5-8 8a5 5 0 0 1-7-7l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7L9.7 17a1.7 1.7 0 0 1-2.4-2.4L15 7",
  image: '<rect x="3" y="4" width="18" height="16" rx="2"></rect><circle cx="9" cy="10" r="1.6"></circle><path d="m21 16-5-5-9 9"></path>',
};
const svg = (inner: string, size = 13, w = 2.2) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;

const controls = (L: IslandLabels) =>
  `<div data-ctl="1" class="isl-ctl">` +
  ([["up", L.moveUp, ICON.up], ["down", L.moveDown, ICON.down], ["remove", L.remove, ICON.remove]] as const)
    .map(([a, title, d]) => `<button type="button" data-act="${a}" title="${esc(title)}" aria-label="${esc(title)}"${a === "remove" ? ' class="danger"' : ""}>${svg(`<path d="${d}"></path>`)}</button>`)
    .join("") +
  `</div>`;

type ImageBlock = Extract<Block, { type: "image" }>;
type FileBlock = Extract<Block, { type: "file" }>;
type VideoBlock = Extract<Block, { type: "video" }>;

export function islandHtml(b: ImageBlock | FileBlock | VideoBlock, L: IslandLabels, uploading?: string) {
  if (b.type === "image") {
    const box = uploading
      ? `<div class="isl-img isl-busy">${esc(L.uploading(uploading))}</div>`
      : b.id
        ? `<div class="isl-img"><img src="/api/uploads/${esc(b.id)}" alt=""></div>`
        : `<label class="isl-img isl-drop">${svg(ICON.image, 22, 1.7)}<span>${esc(L.dropImage)}</span><input type="file" data-f="imgfile" accept="image/png,image/jpeg,image/webp,image/gif" hidden></label>`;
    return (
      `<figure data-island="image" data-type="image" data-id="${esc(b.id)}" data-size="${esc(b.size)}" contenteditable="false" class="isl isl-image">${controls(L)}${box}` +
      `<input data-f="caption" value="${esc(b.caption)}" placeholder="${esc(L.caption)}" aria-label="${esc(L.caption)}">` +
      `<input data-f="alt" value="${esc(b.alt)}" placeholder="${esc(L.altText)}" aria-label="${esc(L.altText)}">` +
      `<span class="isl-help">${esc(L.altHelp)}</span></figure>`
    );
  }
  if (b.type === "video") {
    const [hint, bad] = L.videoHint(b.url);
    return (
      `<div data-island="video" data-type="video" data-dur="${esc(b.dur)}" contenteditable="false" class="isl isl-video">${controls(L)}` +
      `<div class="isl-row"><span class="play">${svg('<path d="M7 4.5v15l12.5-7.5z" fill="currentColor" stroke="none"></path>', 12)}</span>` +
      `<input data-f="url" value="${esc(b.url)}" placeholder="${esc(L.videoUrl)}" aria-label="${esc(L.videoUrl)}"></div>` +
      `<div class="isl-indent"><input data-f="title" value="${esc(b.title)}" placeholder="${esc(L.videoTitle)}" aria-label="${esc(L.videoTitle)}">` +
      `<span data-f="hint" class="isl-help${bad ? " bad" : ""}">${esc(hint)}</span></div></div>`
    );
  }
  if (b.id && !uploading) {
    const fb = fileBadge(b.name);
    return (
      `<div data-island="file" data-type="file" data-id="${esc(b.id)}" data-name="${esc(b.name)}" data-size="${esc(b.size)}" contenteditable="false" class="isl isl-file">${controls(L)}` +
      `<span class="file-badge ${fb.kind}">${esc(fb.ext)}</span><span class="file-text"><span class="file-name">${esc(b.name)}</span><span class="file-meta">${esc(b.size)}</span></span></div>`
    );
  }
  return (
    `<div data-island="file" data-type="file" data-id="" data-name="" data-size="" contenteditable="false" class="isl">${controls(L)}` +
    `<label class="isl-pick">${svg(`<path d="${ICON.clip}"></path>`, 18, 1.8)}<span class="t"><span class="h">${esc(uploading ? L.uploading(uploading) : L.chooseFile)}</span>` +
    `<span data-f="ferr" class="isl-help">${esc(L.fileLimits)}</span></span>` +
    `<input type="file" data-f="file" accept=".pdf,.xlsx,.xls,.csv,.ods,.docx,.doc,.odt,.pptx" hidden></label></div>`
  );
}

/** Editable HTML for a body. With `fragment`, media are dropped (used for pasting). */
export function bodyToHtml(body: string, L: IslandLabels, fragment = false) {
  const blocks = parseBody(body);
  let h = blocks
    .map((b) => {
      switch (b.type) {
        case "h": return `<h2>${esc(b.text)}</h2>`;
        case "quote": return `<blockquote>${inlineHtml(b.text) || "<br>"}</blockquote>`;
        case "ul": case "ol": return `<${b.type}>${b.items.map((x) => `<li>${inlineHtml(x) || "<br>"}</li>`).join("")}</${b.type}>`;
        case "table":
          return `<table><tbody>${b.rows.map((r, ri) => `<tr>${r.map((c) => (ri ? `<td>${esc(c) || "<br>"}</td>` : `<th>${esc(c) || "<br>"}</th>`)).join("")}</tr>`).join("")}</tbody></table>`;
        case "image": case "video": case "file": return fragment ? "" : islandHtml(b, L);
        default: return `<p>${inlineHtml(b.text) || "<br>"}</p>`;
      }
    })
    .join("");
  if (fragment) return h;
  const last = blocks.at(-1);
  if (!last || !["h", "p", "quote", "ul", "ol"].includes(last.type)) h += "<p><br></p>";
  return h;
}

/* Reading the DOM back */

const isBold = (n: HTMLElement) => {
  const fw = n.style?.fontWeight;
  if (fw === "normal" || fw === "400") return false;
  return n.tagName === "B" || n.tagName === "STRONG" || /^(bold|[6-9]00)$/.test(fw || "");
};
const isItalic = (n: HTMLElement) => n.tagName === "I" || n.tagName === "EM" || n.style?.fontStyle === "italic";

// Wraps text in a bold or italic marker, leaving links inside it unwrapped (the format can't nest them).
const LINK_RE = /(\[[^\]]+\]\([^)\s]+\))/;
const mark = (core: string, m: string) =>
  core
    .split(LINK_RE)
    .map((part, i) => {
      if (i % 2 || !part.trim()) return part;
      const lead = part.match(/^\s*/)![0], trail = part.match(/\s*$/)![0];
      return lead + m + part.trim() + m + trail;
    })
    .join("");

function inlineMd(node: { childNodes: NodeListOf<ChildNode> | ChildNode[] }): string {
  let s = "";
  node.childNodes.forEach((n) => {
    if (n.nodeType === 3) { s += (n as Text).data; return; }
    if (n.nodeType !== 1) return;
    const el = n as HTMLElement;
    if (el.tagName === "BR") { s += " "; return; }
    if (/^(UL|OL|TABLE|SCRIPT|STYLE)$/.test(el.tagName)) return;
    const inner = inlineMd(el);
    if (!inner.trim()) { s += inner; return; }
    const lead = inner.match(/^\s*/)![0], trail = inner.match(/\s*$/)![0];
    let core = inner.trim();
    const href = el.tagName === "A" && el.getAttribute("href");
    if (href && /^(https?:|mailto:)/i.test(href)) core = `[${core.replace(/[[\]]/g, "")}](${href.replace(/[()\s]/g, (c) => encodeURIComponent(c))})`;
    else {
      if (isBold(el)) core = mark(core.replace(/\*\*/g, ""), "**");
      if (isItalic(el)) core = mark(core, "*");
    }
    s += lead + core + trail;
  });
  return s.replace(/ /g, " ");
}

const BLOCK_RE = /^(P|DIV|H[1-6]|UL|OL|BLOCKQUOTE|TABLE|FIGURE|SECTION|ARTICLE|MAIN|HEADER|FOOTER|BODY|PRE)$/;
const fieldValue = (n: Element, f: string) => (n.querySelector(`[data-f="${f}"]`) as HTMLInputElement | null)?.value ?? "";
const cellText = (c: Element) => (c.textContent ?? "").replace(/ /g, " ").trim();

function walk(root: Element, out: Block[]) {
  let buf = "";
  const flush = () => { if (buf.trim()) out.push({ type: "p", text: buf.trim() }); buf = ""; };
  root.childNodes.forEach((n) => {
    if (n.nodeType === 3) { buf += (n as Text).data.replace(/ /g, " "); return; }
    if (n.nodeType !== 1) return;
    const el = n as HTMLElement, t = el.tagName, ty = el.dataset?.type;
    if (!ty && !BLOCK_RE.test(t)) {
      if (t === "BR") { flush(); return; }
      buf += inlineMd({ childNodes: [el] });
      return;
    }
    flush();
    if (ty === "image") { if (el.dataset.id) out.push({ type: "image", id: el.dataset.id, caption: fieldValue(el, "caption"), alt: fieldValue(el, "alt"), size: el.dataset.size || "" }); }
    else if (ty === "video") out.push({ type: "video", url: fieldValue(el, "url"), title: fieldValue(el, "title"), dur: el.dataset.dur || "" });
    else if (ty === "file") { if (el.dataset.id) out.push({ type: "file", id: el.dataset.id, name: el.dataset.name || "", size: el.dataset.size || "" }); }
    else if (/^H[1-6]$/.test(t)) { const x = cellText(el); if (x) out.push({ type: "h", text: x }); }
    else if (t === "UL" || t === "OL") out.push({ type: t === "UL" ? "ul" : "ol", items: [...el.querySelectorAll("li")].map((li) => inlineMd(li).trim()) });
    else if (t === "BLOCKQUOTE") out.push({ type: "quote", text: inlineMd(el).trim() });
    else if (t === "TABLE") { const rows = [...el.querySelectorAll("tr")].map((tr) => [...tr.children].map(cellText)); if (rows.length) out.push({ type: "table", rows }); }
    else if ([...el.children].some((c) => BLOCK_RE.test(c.tagName) || (c as HTMLElement).dataset?.type)) walk(el, out);
    else out.push({ type: "p", text: inlineMd(el).trim() });
  });
  flush();
  return out;
}

export const serialize = (root: Element) => toBody(walk(root, []));
