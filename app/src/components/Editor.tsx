"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { BackIcon } from "@/components/icons";
import { Globe } from "@/components/LanguageMenu";
import { useToast } from "@/components/Toast";
import { useI18n } from "@/i18n/client";
import { changesOf, contentSig, fmtSize, hashText, MAX_UPLOAD_BYTES, parseBody, plainBody, SUMMARY_MIN_CHARS, type Change } from "@/lib/body";
import { changeLabel } from "@/lib/change-label";
import { formatScore, scaleSuffix, type Scale } from "@/lib/scale";
import { describeChanges, publish, saveDraft, writeSummary } from "@/app/(app)/actions";
import { describeChangeRequest, submitChangeRequest } from "@/app/(app)/team-actions";
import { bodyToHtml, inlineHtml, islandHtml, serialize, videoHint, type IslandLabels } from "./editor/dom";

type Content = { title: string; summary: string; body: string };

export type EditorProps = {
  id: string | null;
  initial: Content & { note: string; noteAuto: boolean; noteFor: string; summaryAuto: boolean; summaryFor: string };
  /** The latest published version, to compare against. */
  latest: (Content & { number: number }) | null;
  savedLabel: string | null;
  history: { number: number; note: string; date: string; by: string }[];
  /** Streams detected from the saved draft, strongest first. */
  scores: { streamId: string; name: string; color: string; score: number }[];
  meName: string;
  scale: Scale;
  scoredBy: "author" | "reviewers" | "both";
  /** Native names of the languages a published version is translated into, if translating on publish. */
  translateInto: string[];
  /**
   * Suggesting changes as a team member: the editor starts from version `base` (in `latest`), there's no draft,
   * and submitting sends a change request to the lead. `crId` when updating a request that was sent back.
   */
  cr?: { base: number; crId: string | null; lead: string; note: string };
};

type Sel = { bt: string; b: boolean; i: boolean; a: boolean; tbl: boolean; bub: { x: number; y: number; mode: "fmt" | "link"; href?: string } | null };
type SaveDialog = { note: string; busy: boolean; edited: boolean; changes: Change[]; sig: string };
type CrDialog = { note: string; busy: boolean; edited: boolean; changes: string[]; sig: string; cur: Content };

const SLASH = [
  ["p", "ed.slashText", "ed.slashTextDesc", "paragraph text", "Aa", "sans"],
  ["h", "ed.heading", "ed.slashHeadingDesc", "heading title h2 section", "H", "sans"],
  ["ul", "ed.bulleted", "ed.slashUlDesc", "bullet list unordered", "•", "sans"],
  ["ol", "ed.numbered", "ed.slashOlDesc", "numbered list ordered", "1.", "sans"],
  ["quote", "ed.quote", "ed.slashQuoteDesc", "quote blockquote", "“", "serif"],
  ["table", "ed.table", "ed.slashTableDesc", "table grid"],
  ["image", "ed.image", "ed.slashImageDesc", "image photo picture"],
  ["video", "ed.video", "ed.slashVideoDesc", "video youtube vimeo"],
  ["file", "ed.file", "ed.slashFileDesc", "file attachment pdf document"],
] as const;
const TEXT_KINDS = ["p", "h", "quote", "ul", "ol"];

const I = {
  link: <><path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1" /><path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1" /></>,
  ul: <><path d="M9 7h11M9 12h11M9 17h11" /><circle cx="4.5" cy="7" r="1" fill="currentColor" /><circle cx="4.5" cy="12" r="1" fill="currentColor" /><circle cx="4.5" cy="17" r="1" fill="currentColor" /></>,
  image: <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="1.6" /><path d="m21 16-5-5-9 9" /></>,
  table: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18M3 15h18M10 4v16" /></>,
  video: <><rect x="3" y="5" width="13" height="14" rx="2" /><path d="m16 10 5-3v10l-5-3" /></>,
  file: <path d="m20 11.5-8 8a5 5 0 0 1-7-7l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7L9.7 17a1.7 1.7 0 0 1-2.4-2.4L15 7" />,
};
const Svg = ({ children, size = 16 }: { children: React.ReactNode; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);

export function Editor(props: EditorProps) {
  const { id, latest: L, scale, scoredBy } = props;
  const router = useRouter();
  const toast = useToast();
  const { t, tn } = useI18n();
  const [pending, start] = useTransition();
  const [title, setTitle] = useState(props.initial.title);
  const [summary, setSummary] = useState(props.initial.summary);
  const [note, setNote] = useState({ text: props.initial.note, auto: props.initial.noteAuto, sig: props.initial.noteFor });
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<string | null>(props.savedLabel);
  const [sel, setSel] = useState<Sel | null>(null);
  const [link, setLink] = useState<{ x: number; y: number; url: string; hadLink: boolean } | null>(null);
  const [slash, setSlash] = useState<{ x: number; y: number; q: string; idx: number } | null>(null);
  const [dialog, setDialog] = useState<SaveDialog | null>(null);
  const [crDialog, setCrDialog] = useState<CrDialog | null>(null);
  const cr = props.cr;
  // The summary can be written from the body; remember whether it was, and for which body, to flag it when it goes stale.
  const [sumMeta, setSumMeta] = useState({ auto: props.initial.summaryAuto, sig: props.initial.summaryFor, busy: false });
  const [bodyNow, setBodyNow] = useState(props.initial.body);
  const summaryJob = useRef<Promise<string> | null>(null);

  const edRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef(props.initial.body);
  const lastRange = useRef<Range | null>(null);
  const linkRange = useRef<Range | null>(null);
  const slashBlock = useRef<Node | null>(null);
  const curBlock = useRef<HTMLElement | null>(null);
  const syncTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const n = (L?.number ?? 0) + 1;
  const vn = `v${n}`;
  const sfx = scaleSuffix(scale);

  const labels: IslandLabels = {
    moveUp: t("ed.moveUp"), moveDown: t("ed.moveDown"), remove: t("ed.remove"),
    dropImage: t("ed.dropImage"), caption: t("ed.caption"), altText: t("ed.altText"), altHelp: t("ed.altHelp"),
    videoUrl: t("ed.videoUrl"), videoTitle: t("ed.videoTitle"), chooseFile: t("ed.chooseFile"), fileLimits: t("ed.fileLimits"),
    videoHint: (url) => videoHint(url, { hint: t("ed.videoHint"), linked: (host) => t("ed.videoLinked", { host }), bad: t("ed.videoBad") }),
    uploading: (name) => t("ed.uploading", { name }),
  };

  /* Keeping the DOM and the body in step */

  useEffect(() => {
    const ed = edRef.current!;
    ed.innerHTML = bodyToHtml(props.initial.body, labels);
    ensureTail();
    // Loaded once: the editor DOM is the source of truth from here on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const flush = () => {
    if (edRef.current) bodyRef.current = serialize(edRef.current);
    setBodyNow(bodyRef.current);
    return bodyRef.current;
  };
  const sync = () => {
    clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(flush, 120);
    setError("");
  };

  function ensureTail() {
    const ed = edRef.current;
    if (!ed) return;
    if (!ed.firstElementChild && !ed.textContent?.trim()) { ed.innerHTML = "<p><br></p>"; return; }
    const last = ed.lastElementChild;
    if (!last || last.hasAttribute("data-island") || last.tagName === "TABLE") ed.insertAdjacentHTML("beforeend", "<p><br></p>");
  }
  const topBlock = (node: Node | null) => {
    const ed = edRef.current;
    while (node && node.parentNode !== ed) node = node.parentNode;
    return node && node.parentNode === ed ? node : null;
  };
  const curNode = (): HTMLElement | null => {
    const s = document.getSelection();
    if (!s || !s.rangeCount || !edRef.current) return null;
    const r = s.getRangeAt(0);
    if (!edRef.current.contains(r.startContainer)) return null;
    return (r.startContainer.nodeType === 3 ? r.startContainer.parentNode : r.startContainer) as HTMLElement;
  };
  const restore = () => {
    const ed = edRef.current;
    if (!ed) return;
    if (document.activeElement !== ed) ed.focus({ preventScroll: true });
    const r = lastRange.current;
    if (r && ed.contains(r.startContainer)) {
      const s = document.getSelection()!;
      s.removeAllRanges();
      s.addRange(r);
    }
  };
  const caretIn = (el: Node | null, atStart = false) => {
    if (!el) return;
    const r = document.createRange();
    r.selectNodeContents(el);
    r.collapse(atStart);
    const s = document.getSelection()!;
    s.removeAllRanges();
    s.addRange(r);
    lastRange.current = r.cloneRange();
  };
  const blockType = (n: HTMLElement) => (n.closest("h1,h2,h3") ? "h" : n.closest("blockquote") ? "quote" : n.closest("ul") ? "ul" : n.closest("ol") ? "ol" : "p");
  const exec = (cmd: string, value?: string) => {
    restore();
    document.execCommand(cmd, false, value);
    sync();
    onSel();
  };
  const retag = (top: Node, tag: string) => {
    let el = top as HTMLElement;
    if (top.nodeType === 3) {
      el = document.createElement("p");
      (top as Text).replaceWith(el);
      el.appendChild(top);
    }
    if (el.tagName === tag) return el;
    const nw = document.createElement(tag);
    while (el.firstChild) nw.appendChild(el.firstChild);
    if (!nw.firstChild) nw.innerHTML = "<br>";
    el.replaceWith(nw);
    caretIn(nw);
    return nw;
  };
  const fixLists = () => {
    edRef.current?.querySelectorAll("p > ul, p > ol, h2 > ul, h2 > ol").forEach((l) => {
      const p = l.parentNode as HTMLElement;
      p.after(l);
      if (!p.textContent?.trim()) p.remove();
    });
  };
  const setBlock = (kind: string) => {
    restore();
    let node = curNode();
    if (!node) return;
    let top = topBlock(node) as HTMLElement | null;
    if (!top || (top.nodeType === 1 && (top.hasAttribute("data-island") || top.tagName === "TABLE"))) return;
    const cur = blockType(node);
    if (kind === "ul" || kind === "ol") {
      if (cur === "h" || cur === "quote") top = retag(top, "P");
      document.execCommand(kind === "ul" ? "insertUnorderedList" : "insertOrderedList");
      fixLists();
      sync();
      onSel();
      return;
    }
    if (cur === "ul" || cur === "ol") {
      document.execCommand(cur === "ul" ? "insertUnorderedList" : "insertOrderedList");
      node = curNode();
      top = node && (topBlock(node) as HTMLElement | null);
      if (!top) return;
    }
    const to = cur === kind ? "p" : kind;
    retag(top, to === "h" ? "H2" : to === "quote" ? "BLOCKQUOTE" : "P");
    sync();
    onSel();
  };

  /* Selection: toolbar state and the floating menus */

  function onSel() {
    const ed = edRef.current;
    if (!ed) return;
    const s = document.getSelection();
    if (!s || !s.rangeCount) return;
    const r = s.getRangeAt(0);
    const inEditor = ed.contains(r.commonAncestorContainer) && document.activeElement === ed;
    if (!inEditor) {
      setSel((x) => (x?.bub ? { ...x, bub: null } : x));
      if (document.activeElement !== ed) setSlash(null);
      return;
    }
    // Opening the link box re-selects the text it applies to; only a different selection closes it.
    const lr = linkRange.current;
    const same = lr && r.startContainer === lr.startContainer && r.startOffset === lr.startOffset && r.endContainer === lr.endContainer && r.endOffset === lr.endOffset;
    if (!same) setLink(null);
    lastRange.current = r.cloneRange();
    const node = (r.startContainer.nodeType === 3 ? r.startContainer.parentNode : r.startContainer) as HTMLElement;
    const top = topBlock(node) as HTMLElement | null;
    if (curBlock.current && curBlock.current !== top) curBlock.current.removeAttribute("data-cur");
    if (top?.tagName === "P") { top.setAttribute("data-cur", ""); curBlock.current = top; }
    if (top !== slashBlock.current) setSlash(null);
    const a = node.closest("a");
    const w = ed.parentElement!.getBoundingClientRect();
    let bub: Sel["bub"] = null;
    if (!r.collapsed && r.toString().trim() && !node.closest("[data-island]") && !node.closest("td,th")) {
      const rc = r.getBoundingClientRect();
      bub = { x: Math.round(Math.max(120, Math.min(w.width - 120, rc.left + rc.width / 2 - w.left))), y: Math.round(rc.top - w.top), mode: "fmt" };
    } else if (a && r.collapsed) {
      const rc = a.getBoundingClientRect();
      bub = { x: Math.round(Math.max(150, Math.min(w.width - 150, rc.left + rc.width / 2 - w.left))), y: Math.round(rc.bottom - w.top), mode: "link", href: a.getAttribute("href") ?? "" };
    }
    let b = false, i = false;
    try { b = document.queryCommandState("bold"); i = document.queryCommandState("italic"); } catch {}
    const next: Sel = { bt: blockType(node), b, i, a: !!a, tbl: !!node.closest("td,th"), bub };
    setSel((x) => (JSON.stringify(x) === JSON.stringify(next) ? x : next));
  }
  const onSelRef = useRef(onSel);
  useEffect(() => { onSelRef.current = onSel; });
  // File inputs inside islands are created outside React, so listen for their changes natively.
  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; });
  useEffect(() => {
    const ed = edRef.current!;
    const h = (e: Event) => onChangeRef.current(e);
    ed.addEventListener("change", h);
    return () => ed.removeEventListener("change", h);
  }, []);
  useEffect(() => {
    const h = () => onSelRef.current();
    document.addEventListener("selectionchange", h);
    return () => document.removeEventListener("selectionchange", h);
  }, []);

  /* Typing */

  const mdShortcut = (top: HTMLElement) => {
    const m = (top.textContent ?? "").match(/^(#{1,3}|[-*]|1\.|>)\s/);
    if (!m) return;
    let rem = m[0].length;
    const tw = document.createTreeWalker(top, NodeFilter.SHOW_TEXT);
    let tn: Text | null;
    while (rem > 0 && (tn = tw.nextNode() as Text | null)) {
      const k = Math.min(rem, tn.data.length);
      tn.data = tn.data.slice(k);
      rem -= k;
    }
    if (!top.textContent) top.innerHTML = "<br>";
    caretIn(top, true);
    const k = m[1];
    if (k[0] === "#") retag(top, "H2");
    else if (k === ">") retag(top, "BLOCKQUOTE");
    else { document.execCommand(k === "1." ? "insertOrderedList" : "insertUnorderedList"); fixLists(); }
  };

  const onInput = (e: React.FormEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const native = e.nativeEvent as InputEvent;
    if (target !== edRef.current && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) {
      const input = target as HTMLInputElement;
      if (input.dataset.f === "url") {
        const hint = input.closest("[data-island]")?.querySelector<HTMLElement>("[data-f=hint]");
        const [text, bad] = labels.videoHint(input.value);
        if (hint) { hint.textContent = text; hint.classList.toggle("bad", bad); }
      }
      if (input.dataset.f === "alt" && input.value.trim()) input.classList.remove("missing");
      sync();
      return;
    }
    const node = curNode();
    const top = node && (topBlock(node) as HTMLElement | null);
    if (native.inputType === "insertText" && native.data === " " && top?.nodeType === 1 && (top.tagName === "P" || top.tagName === "DIV")) mdShortcut(top);
    if (top?.nodeType === 1 && top.tagName === "P") {
      const tx = top.textContent ?? "";
      if (slash) {
        if (!tx.startsWith("/") || tx.length > 24) setSlash(null);
        else setSlash({ ...slash, q: tx.slice(1), idx: 0 });
      } else if (native.data === "/" && tx === "/") {
        const w = edRef.current!.parentElement!.getBoundingClientRect(), rc = top.getBoundingClientRect();
        slashBlock.current = top;
        setSlash({ x: Math.round(rc.left - w.left), y: Math.round(rc.bottom - w.top + 6), q: "", idx: 0 });
      }
    } else if (slash) setSlash(null);
    ensureTail();
    sync();
  };

  const slashItems = () => {
    const q = (slash?.q ?? "").toLowerCase().trim();
    return SLASH.filter((x) => !q || t(x[1]).toLowerCase().includes(q) || x[3].includes(q));
  };
  const slashPick = (kind: string) => {
    const top = slashBlock.current as HTMLElement | null;
    setSlash(null);
    if (top && edRef.current?.contains(top)) {
      top.innerHTML = "<br>";
      edRef.current.focus({ preventScroll: true });
      caretIn(top, true);
    }
    insertKind(kind);
  };
  const insertKind = (kind: string) => {
    if (TEXT_KINDS.includes(kind)) return setBlock(kind);
    if (kind === "table") return insertTable();
    insertIsland(kind as "image" | "video" | "file");
  };

  /* Tables and media */

  const placeBlocks = (nodes: Node[]) => {
    const ed = edRef.current!;
    restore();
    const node = curNode();
    const top = node && (topBlock(node) as HTMLElement | null);
    const empty = top?.nodeType === 1 && top.tagName === "P" && !top.textContent?.trim();
    const after = document.createElement("p");
    after.innerHTML = "<br>";
    const next = top ? top.nextElementSibling : null;
    const needAfter = !(next && next.tagName === "P" && !next.textContent?.trim());
    const list = needAfter ? [...nodes, after] : nodes;
    if (!top) ed.append(...list);
    else if (empty) top.replaceWith(...list);
    else top.after(...list);
    ensureTail();
    return needAfter ? after : next;
  };
  const insertTable = () => {
    const tb = document.createElement("table");
    tb.innerHTML = "<tbody><tr><th><br></th><th><br></th><th><br></th></tr><tr><td><br></td><td><br></td><td><br></td></tr><tr><td><br></td><td><br></td><td><br></td></tr></tbody>";
    placeBlocks([tb]);
    caretIn(tb.querySelector("th"), true);
    sync();
    onSel();
  };
  const islandNode = (html: string) => {
    const tmp = document.createElement("div");
    tmp.innerHTML = html;
    return tmp.firstElementChild as HTMLElement;
  };
  const insertIsland = (kind: "image" | "video" | "file") => {
    if (!edRef.current) return;
    const b = kind === "image" ? { type: kind, id: "", caption: "", alt: "", size: "" } as const : kind === "video" ? { type: kind, url: "", title: "", dur: "" } as const : { type: kind, id: "", name: "", size: "" } as const;
    const isl = islandNode(islandHtml(b, labels));
    const after = placeBlocks([isl]);
    if (kind === "video") setTimeout(() => isl.querySelector<HTMLInputElement>("[data-f=url]")?.focus(), 30);
    else setTimeout(() => isl.querySelector<HTMLInputElement>("input[type=file]")?.click(), 30);
    if (after && kind !== "video") caretIn(after, true);
    sync();
  };

  /** Uploads a file into an island, replacing `into` (an empty island) or inserting a new one at the caret. */
  async function addFile(f: File, into?: HTMLElement) {
    if (f.size > MAX_UPLOAD_BYTES) return toast(t("ed.errTooBig", { name: f.name, size: fmtSize(f.size) }));
    const kind = /^image\//.test(f.type) && (!into || into.dataset.type === "image") ? "image" : "file";
    const placeholder = kind === "image" ? { type: kind, id: "", caption: "", alt: "", size: "" } as const : { type: kind, id: "", name: "", size: "" } as const;
    const busy = islandNode(islandHtml(placeholder, labels, f.name));
    if (into) {
      // Keep any caption or alt text already typed.
      busy.querySelectorAll<HTMLInputElement>("input[data-f]").forEach((i) => { const old = into.querySelector<HTMLInputElement>(`[data-f="${i.dataset.f}"]`); if (old && old.type !== "file") i.value = old.value; });
      into.replaceWith(busy);
    } else placeBlocks([busy]);
    const form = new FormData();
    form.append("file", f);
    form.append("kind", kind);
    const res = await fetch("/api/uploads", { method: "POST", body: form }).catch(() => null);
    const data = res ? await res.json().catch(() => null) : null;
    if (!res?.ok || !data?.id) {
      toast(data?.error ?? t("ed.errUpload"));
      if (into) busy.replaceWith(into); else busy.remove();
      ensureTail();
      return;
    }
    const ready = islandNode(
      kind === "image"
        ? islandHtml({ type: "image", id: data.id, size: data.size, caption: busy.querySelector<HTMLInputElement>("[data-f=caption]")?.value ?? "", alt: busy.querySelector<HTMLInputElement>("[data-f=alt]")?.value ?? "" }, labels)
        : islandHtml({ type: "file", id: data.id, name: data.name, size: data.size }, labels),
    );
    busy.replaceWith(ready);
    if (kind === "image") ready.querySelector<HTMLInputElement>("[data-f=alt]")?.focus();
    ensureTail();
    sync();
  }

  const onPaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target !== edRef.current && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
    const cd = e.clipboardData;
    const files = [...(cd.files ?? [])];
    e.preventDefault();
    if (files.length) { files.forEach((f) => addFile(f)); return; }
    const html = cd.getData("text/html"), text = cd.getData("text/plain");
    if (html) {
      const tmp = document.createElement("div");
      tmp.innerHTML = html;
      tmp.querySelectorAll("script,style,meta,link,img,svg,iframe").forEach((x) => x.remove());
      const body = serialize(tmp);
      const blocks = parseBody(body);
      if (blocks.length === 1 && blocks[0].type === "p") document.execCommand("insertHTML", false, inlineHtml(blocks[0].text));
      else document.execCommand("insertHTML", false, bodyToHtml(body, labels, true));
    } else if (/\n\s*\n/.test(text)) {
      const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      document.execCommand("insertHTML", false, text.split(/\n\s*\n/).map((p) => `<p>${esc(p.trim()).replace(/\n/g, " ")}</p>`).join(""));
    } else document.execCommand("insertText", false, text.replace(/\n/g, " "));
    fixLists();
    ensureTail();
    sync();
  };
  const onDragOver = (e: React.DragEvent) => {
    if ([...e.dataTransfer.types].includes("Files")) e.preventDefault();
  };
  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    const files = [...e.dataTransfer.files];
    if (!files.length) return;
    e.preventDefault();
    const target = (e.target as HTMLElement).closest<HTMLElement>("[data-island]");
    if (target && !target.dataset.id && target.dataset.type !== "video") return void addFile(files[0], target);
    if (target) return;
    const r = document.caretRangeFromPoint?.(e.clientX, e.clientY);
    if (r && edRef.current?.contains(r.startContainer)) lastRange.current = r;
    files.forEach((f) => addFile(f));
  };
  const onClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>("[data-act]");
    if (!b || !edRef.current?.contains(b)) return;
    e.preventDefault();
    const isl = b.closest("[data-island]")!;
    const act = b.dataset.act;
    if (act === "remove") isl.remove();
    if (act === "up" && isl.previousElementSibling) isl.previousElementSibling.before(isl);
    if (act === "down" && isl.nextElementSibling) isl.nextElementSibling.after(isl);
    ensureTail();
    sync();
  };
  function onChange(e: Event) {
    const input = e.target as HTMLInputElement;
    if (input.dataset.f !== "file" && input.dataset.f !== "imgfile") return;
    const f = input.files?.[0];
    if (f) addFile(f, input.closest<HTMLElement>("[data-island]")!);
  }

  const tableOp = (op: "row" | "col" | "delrow" | "delcol" | "deltable") => {
    restore();
    const node = curNode();
    const cell = node?.closest("td,th") as HTMLElement | null;
    if (!cell) return;
    const tr = cell.parentElement!, table = cell.closest("table")!;
    const ci = [...tr.children].indexOf(cell);
    const rows = [...table.querySelectorAll("tr")];
    if (op === "row") {
      const nr = document.createElement("tr");
      [...tr.children].forEach(() => { const td = document.createElement("td"); td.innerHTML = "<br>"; nr.append(td); });
      tr.after(nr);
      caretIn(nr.children[ci], true);
    }
    if (op === "col") {
      rows.forEach((r, ri) => {
        const c = document.createElement(ri === 0 ? "th" : "td");
        c.innerHTML = "<br>";
        const ref = r.children[ci];
        if (ref) ref.after(c); else r.append(c);
      });
      caretIn(tr.children[ci + 1], true);
    }
    if (op === "delrow") {
      if (rows.indexOf(tr as HTMLTableRowElement) === 0 || rows.length <= 2) return toast(t("ed.tableMin"));
      const nx = (tr.nextElementSibling || tr.previousElementSibling)!;
      tr.remove();
      caretIn(nx.children[Math.min(ci, nx.children.length - 1)]);
    }
    if (op === "delcol") {
      if (tr.children.length <= 1) return;
      rows.forEach((r) => r.children[ci]?.remove());
      caretIn(rows[0].children[Math.max(0, ci - 1)]);
    }
    if (op === "deltable") {
      const nx = table.nextElementSibling;
      table.remove();
      ensureTail();
      if (nx) caretIn(nx, true);
    }
    sync();
    onSel();
  };

  /* Links */

  const openLink = () => {
    restore();
    const s = document.getSelection()!;
    if (!s.rangeCount) return;
    let r = s.getRangeAt(0);
    const node = curNode();
    if (!node) return;
    const a = node.closest("a");
    if (a && r.collapsed) {
      r = document.createRange();
      r.selectNodeContents(a);
      s.removeAllRanges();
      s.addRange(r);
    } else if (r.collapsed || !r.toString().trim()) return toast(t("ed.selectToLink"));
    linkRange.current = r.cloneRange();
    const rc = (a || r).getBoundingClientRect();
    const w = edRef.current!.parentElement!.getBoundingClientRect();
    setLink({ x: Math.round(Math.max(180, Math.min(w.width - 180, rc.left + rc.width / 2 - w.left))), y: Math.round(rc.bottom - w.top), url: a?.getAttribute("href") ?? "", hadLink: !!a });
    setTimeout(() => { const i = document.getElementById("ip-link-input") as HTMLInputElement | null; i?.focus(); i?.select(); }, 30);
  };
  const applyLink = (remove = false) => {
    const url0 = (link?.url ?? "").trim();
    setLink(null);
    lastRange.current = linkRange.current;
    restore();
    if (remove || !url0) document.execCommand("unlink");
    else document.execCommand("createLink", false, /^(https?:|mailto:)/i.test(url0) ? url0 : "https://" + url0);
    const s = document.getSelection()!;
    if (s.rangeCount) s.collapseToEnd();
    sync();
    onSel();
  };
  const unlinkHere = () => {
    const a = curNode()?.closest("a");
    if (!a) return;
    const r = document.createRange();
    r.selectNodeContents(a);
    const s = document.getSelection()!;
    s.removeAllRanges();
    s.addRange(r);
    document.execCommand("unlink");
    s.collapseToEnd();
    sync();
    onSel();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== edRef.current) return;
    if (slash) {
      const items = slashItems();
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        if (items.length) setSlash({ ...slash, idx: (slash.idx + (e.key === "ArrowDown" ? 1 : items.length - 1)) % items.length });
        return;
      }
      if ((e.key === "Enter" || e.key === "Tab") && items.length) { e.preventDefault(); slashPick(items[Math.min(slash.idx, items.length - 1)][0]); return; }
      if (e.key === "Escape") { e.preventDefault(); setSlash(null); return; }
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); openLink(); return; }
    if (e.key === "Tab") {
      const cell = curNode()?.closest("td,th");
      if (!cell) return;
      e.preventDefault();
      const cells = [...cell.closest("table")!.querySelectorAll("th,td")];
      const j = cells.indexOf(cell) + (e.shiftKey ? -1 : 1);
      if (j >= 0 && j < cells.length) caretIn(cells[j]);
      else if (!e.shiftKey) {
        tableOp("row");
        const tr = cell.parentElement!.nextElementSibling;
        if (tr) caretIn(tr.firstElementChild, true);
      }
    }
  };

  /* Saving and publishing */

  const content = (): Content => ({ title: title.trim(), summary: summary.trim(), body: flush() });
  const hasBody = (b: string) => plainBody(b).trim().length >= SUMMARY_MIN_CHARS;

  /** Writes the summary from the body. Resolves to the new summary ("" if there isn't enough to go on). */
  const genSummary = () => {
    const body = flush();
    if (!hasBody(body)) { toast(t("ed.sumMore")); return Promise.resolve(""); }
    if (summaryJob.current) return summaryJob.current;
    setSumMeta((m) => ({ ...m, busy: true }));
    const job = writeSummary({ title, body })
      .catch(() => ({ summary: "" }))
      .then((r) => {
        summaryJob.current = null;
        if (r.summary) { setSummary(r.summary); setError(""); }
        setSumMeta({ auto: Boolean(r.summary), sig: hashText(body), busy: false });
        return r.summary;
      });
    summaryJob.current = job;
    return job;
  };

  const openSave = () => {
    const cur = content();
    if (!cur.title) return setError(t("ed.errTitle"));
    // An empty summary is written for you when you save.
    if (!cur.summary && hasBody(cur.body)) genSummary();
    const changes = L ? changesOf(L, cur) : [];
    const sig = contentSig(cur);
    const keep = note.text.trim() && (!note.auto || note.sig === sig);
    const text = !L ? note.text.trim() || t("ed.initialVersion") : keep ? note.text : "";
    const busy = Boolean(L) && !keep && changes.length > 0;
    setDialog({ note: text, busy, edited: !note.auto && Boolean(keep), changes, sig });
    if (busy) fillNote(cur, sig);
  };
  const fillNote = async (cur: Content, sig: string) => {
    setDialog((d) => (d ? { ...d, busy: true } : d));
    const r = await describeChanges({ id, ...cur }).catch(() => ({ note: "" }));
    setDialog((d) => (d && d.sig === sig ? { ...d, note: d.edited ? d.note : r.note, busy: false } : d));
  };
  const confirmSave = () => {
    if (!dialog || dialog.busy) return;
    const d = dialog;
    setDialog(null);
    const next = { text: d.note.trim(), auto: !d.edited, sig: d.sig };
    setNote(next);
    start(async () => {
      const generated = summaryJob.current ? await summaryJob.current : "";
      const cur = content();
      const auto = generated ? { summaryAuto: true, summaryFor: hashText(cur.body) } : { summaryAuto: sumMeta.auto, summaryFor: sumMeta.sig };
      const r = await saveDraft({ id, ...cur, summary: generated || cur.summary, note: next.text, noteAuto: next.auto, noteFor: next.sig, ...auto });
      if (!r.ok) return setError(r.error);
      setSaved(t("ago.justNow"));
      toast(r.streamsChanged ? t("ed.draftSavedStreams") : t("ed.draftSaved"));
      if (!id) router.replace(`/proposals/${r.id}/edit`);
      else router.refresh();
    });
  };

  /* Change requests */

  const openCrSubmit = () => {
    if (!cr || !id) return;
    const cur = content();
    if (!cur.title) return setError(t("cd.errTitle"));
    const changes = L ? changesOf(L, cur) : [];
    if (!changes.length) return setError(t("cd.errNothing", { version: `v${cr.base}` }));
    const sig = contentSig(cur);
    const pre = cr.note.trim();
    setCrDialog({ note: pre, busy: !pre, edited: Boolean(pre), changes: changes.map((c) => changeLabel(c, t, tn)), sig, cur });
    describeChangeRequest({ proposalId: id, base: cr.base, ...cur })
      .catch(() => null)
      .then((r) => setCrDialog((d) => (d && d.sig === sig ? { ...d, changes: r?.ok ? r.changes : d.changes, note: d.edited || !r?.ok ? d.note : r.note, busy: false } : d)));
  };
  const confirmCr = () => {
    if (!cr || !id || !crDialog || crDialog.busy) return;
    const d = crDialog;
    start(async () => {
      const r = await submitChangeRequest({ proposalId: id, crId: cr.crId, base: cr.base, ...d.cur, note: d.note });
      if (!r.ok) { setCrDialog(null); return setError(r.error); }
      setCrDialog(null);
      if (r.message) toast(r.message);
      router.push(`/proposals/${id}`);
    });
  };

  const onPublish = async () => {
    if (cr) return openCrSubmit();
    let cur = content();
    if (!cur.summary && cur.title && hasBody(cur.body)) cur = { ...cur, summary: await genSummary() };
    const missingAlt = parseBody(cur.body).some((b) => b.type === "image" && !b.alt.trim());
    if (missingAlt) {
      edRef.current?.querySelectorAll<HTMLInputElement>("[data-type=image] [data-f=alt]").forEach((i) => { if (!i.value.trim()) i.classList.add("missing"); });
      return setError(t("ed.errAlt"));
    }
    start(async () => {
      const r = await publish({ id, ...cur, note: note.text, noteAuto: note.auto, noteFor: note.sig, summaryAuto: sumMeta.auto, summaryFor: sumMeta.sig });
      if (!r.ok) return setError(r.error);
      const version = `v${r.version}`;
      toast(r.translating ? tn("ed.publishedTranslating", r.translating, { version }) : t("ed.publishedToast", { version }));
      router.push(`/proposals/${r.id}`);
    });
  };

  const sumEmpty = !summary.trim();
  const sumStale = sumMeta.auto && !sumEmpty && sumMeta.sig !== hashText(bodyNow);
  const sumBtn = sumEmpty ? t("ed.sumGenerate") : sumStale ? t("ed.sumUpdate") : sumMeta.auto ? t("ed.sumRegenerate") : t("ed.sumGenerate");
  const sumNote = sumEmpty
    ? hasBody(bodyNow) ? t("ed.sumEmptyNote") : t("ed.sumWriteFirst")
    : sumStale ? t("ed.sumStale") : sumMeta.auto ? t("ed.sumAutoNote") : t("ed.sumOwnNote");
  const statusText = cr ? t("ed.crStatus", { version: `v${cr.base}`, name: cr.lead }) : !id ? t("ed.statusNew") : L ? t("ed.statusPublished", { version: `v${L.number}` }) + (saved ? " · " + t("ed.statusDraftOf", { version: vn }) : "") : t("ed.statusDraft");
  const md = (fn: () => void) => (e: React.MouseEvent) => { e.preventDefault(); fn(); };
  const on = (x?: boolean) => (x ? " on" : "");
  const S = sel ?? ({} as Partial<Sel>);
  const draftNote = note.text.trim();
  const items = slash ? slashItems() : [];
  const slashIdx = slash ? Math.min(slash.idx, items.length - 1) : 0;

  return (
    <main className="edit-main" data-screen-label="Editor">
      <div className="edit-bar">
        <Link href={id ? `/proposals/${id}` : "/"} className="back-link"><BackIcon />{cr ? t("rv.back") : id ? t("ed.back") : t("ed.cancel")}</Link>
        <span className="sep">/</span>
        <span className="heading">{cr ? t("ed.crHeading", { version: `v${cr.base}` }) : !id ? t("ed.newProposal") : L ? t("ed.editingVersion", { version: vn }) : t("ed.editingDraft")}</span>
        <div className="grow" />
        {saved && !cr ? <span className="saved">{t("ed.savedAt", { when: saved })}</span> : null}
        {!cr ? <button className="btn-secondary" onClick={openSave} disabled={pending}>{t("ed.saveDraft")}</button> : null}
        <button className="btn-primary" onClick={onPublish} disabled={pending}>{pending ? t("ed.working") : cr ? t("ed.submitReview") : L ? t("ed.publishVersion", { version: vn }) : t("ed.publish")}</button>
      </div>
      <div className="edit-cols">
        <div className="edit-paper">
          <textarea className="edit-title" value={title} onChange={(e) => { setTitle(e.target.value); setError(""); }} placeholder={t("ed.titlePlaceholder")} aria-label={t("ed.titlePlaceholder")} rows={2} />
          <div className="sum-wrap">
            <textarea
              className={`edit-summary${sumMeta.busy ? " busy" : ""}`}
              value={summary}
              onChange={(e) => { setSummary(e.target.value); setSumMeta((m) => ({ ...m, auto: false })); setError(""); }}
              placeholder={t("ed.summaryPlaceholder")}
              aria-label={t("ed.summary")}
              rows={2}
            />
            <div className="sum-help" data-testid="summary-help">
              {sumMeta.busy ? (
                <span>{t("ed.sumWriting")}</span>
              ) : (
                <>
                  <span className={sumStale ? "stale" : undefined}>{sumNote}</span>
                  {hasBody(bodyNow) ? <button type="button" className="sum-btn" onClick={() => genSummary()}>{sumBtn}</button> : null}
                </>
              )}
            </div>
          </div>

          <div role="toolbar" aria-label={t("ed.toolbar")} className="ed-toolbar">
            <select value={S.bt === "h" || S.bt === "quote" ? S.bt : "p"} onChange={(e) => setBlock(e.target.value)} aria-label={t("ed.textStyle")}>
              <option value="p">{t("ed.paragraph")}</option>
              <option value="h">{t("ed.heading")}</option>
              <option value="quote">{t("ed.quote")}</option>
            </select>
            <span className="tb-sep" />
            <button type="button" onMouseDown={md(() => exec("bold"))} title={t("ed.bold")} aria-label={t("ed.bold")} aria-pressed={!!S.b} className={`tb b${on(S.b)}`}>B</button>
            <button type="button" onMouseDown={md(() => exec("italic"))} title={t("ed.italic")} aria-label={t("ed.italic")} aria-pressed={!!S.i} className={`tb i${on(S.i)}`}>I</button>
            <button type="button" onMouseDown={md(openLink)} title={t("ed.link")} aria-label={t("ed.link")} className={`tb${on(S.a)}`}><Svg>{I.link}</Svg></button>
            <span className="tb-sep" />
            <button type="button" onMouseDown={md(() => setBlock("ul"))} title={t("ed.bulleted")} aria-label={t("ed.bulleted")} className={`tb${on(S.bt === "ul")}`}><Svg>{I.ul}</Svg></button>
            <button type="button" onMouseDown={md(() => setBlock("ol"))} title={t("ed.numbered")} aria-label={t("ed.numbered")} className={`tb ol${on(S.bt === "ol")}`}>1.</button>
            <span className="tb-sep" />
            {S.tbl ? (
              <div className="tb-group">
                <span className="tb-label">{t("ed.table")}</span>
                <button type="button" className="tb sm" onMouseDown={md(() => tableOp("row"))}>{t("ed.addRow")}</button>
                <button type="button" className="tb sm" onMouseDown={md(() => tableOp("col"))}>{t("ed.addCol")}</button>
                <button type="button" className="tb sm" onMouseDown={md(() => tableOp("delrow"))}>{t("ed.delRow")}</button>
                <button type="button" className="tb sm" onMouseDown={md(() => tableOp("delcol"))}>{t("ed.delCol")}</button>
                <button type="button" className="tb sm danger" onMouseDown={md(() => tableOp("deltable"))}>{t("ed.delTable")}</button>
              </div>
            ) : (
              <div className="tb-group">
                <button type="button" className="tb wide" onMouseDown={md(() => insertKind("image"))} title={t("ed.insertImage")}><Svg>{I.image}</Svg>{t("ed.image")}</button>
                <button type="button" className="tb wide" onMouseDown={md(() => insertKind("table"))} title={t("ed.insertTable")}><Svg>{I.table}</Svg>{t("ed.table")}</button>
                <button type="button" className="tb wide" onMouseDown={md(() => insertKind("video"))} title={t("ed.insertVideo")}><Svg>{I.video}</Svg>{t("ed.video")}</button>
                <button type="button" className="tb wide" onMouseDown={md(() => insertKind("file"))} title={t("ed.attachFile")}><Svg>{I.file}</Svg>{t("ed.file")}</button>
              </div>
            )}
            <span className="grow" />
            <span className="tb-hint">{t("ed.typeSlash", { slash: "/" }).split("/").flatMap((part, i) => (i ? [<b key={i}>/</b>, part] : [part]))}</span>
          </div>

          <div className="ed-wrap">
            <div
              ref={edRef}
              data-ip-editor="1"
              style={{ "--ed-hint": JSON.stringify(t("ed.bodyHint")), "--ed-empty": JSON.stringify(t("ed.bodyEmpty")) } as React.CSSProperties}
              contentEditable
              suppressContentEditableWarning
              role="textbox"
              aria-multiline="true"
              aria-label={t("ed.body")}
              spellCheck
              onFocus={() => { try { document.execCommand("defaultParagraphSeparator", false, "p"); } catch {} }}
              onInput={onInput}
              onKeyDown={onKeyDown}
              onPaste={onPaste}
              onDragOver={onDragOver}
              onDrop={onDrop}
              onClick={onClick}
            />
            {S.bub?.mode === "fmt" && !link && !slash ? (
              <div className="ed-bubble" style={{ left: S.bub.x, top: S.bub.y }}>
                <button type="button" onMouseDown={md(() => exec("bold"))} title={t("ed.bold")} className={`b${on(S.b)}`}>B</button>
                <button type="button" onMouseDown={md(() => exec("italic"))} title={t("ed.italic")} className={`i${on(S.i)}`}>I</button>
                <button type="button" onMouseDown={md(openLink)} title={t("ed.link")} className={on(S.a)}><Svg size={15}>{I.link}</Svg></button>
                <span className="sep" />
                <button type="button" onMouseDown={md(() => setBlock("h"))} title={t("ed.heading")} className={`h${on(S.bt === "h")}`}>H</button>
                <button type="button" onMouseDown={md(() => setBlock("quote"))} title={t("ed.quote")} className={`q${on(S.bt === "quote")}`}>“</button>
              </div>
            ) : null}
            {S.bub?.mode === "link" && !link && !slash ? (
              <div className="ed-linkbub" style={{ left: S.bub.x, top: S.bub.y }}>
                <a href={S.bub.href} target="_blank" rel="noopener noreferrer">{S.bub.href}</a>
                <button type="button" onMouseDown={md(openLink)}>{t("ed.edit")}</button>
                <button type="button" className="danger" onMouseDown={md(unlinkHere)}>{t("ed.remove")}</button>
              </div>
            ) : null}
            {link ? (
              <div className="ed-linked" style={{ left: link.x, top: link.y }}>
                <input
                  id="ip-link-input"
                  value={link.url}
                  onChange={(e) => setLink({ ...link, url: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { e.preventDefault(); applyLink(); }
                    if (e.key === "Escape") { e.preventDefault(); setLink(null); lastRange.current = linkRange.current; restore(); }
                  }}
                  placeholder={t("ed.linkPlaceholder")}
                  aria-label={t("ed.linkPlaceholder")}
                />
                <button type="button" className="apply" onMouseDown={md(() => applyLink())}>{t("ed.apply")}</button>
                {link.hadLink ? <button type="button" className="danger" onMouseDown={md(() => applyLink(true))}>{t("ed.remove")}</button> : null}
              </div>
            ) : null}
            {slash ? (
              <div className="ed-slash" style={{ left: slash.x, top: slash.y }} role="listbox" aria-label={t("ed.insert")}>
                <div className="head">{t("ed.insert")}</div>
                {items.map((x, i) => (
                  <button
                    type="button"
                    key={x[0]}
                    role="option"
                    aria-selected={i === slashIdx}
                    className={i === slashIdx ? "on" : undefined}
                    onMouseDown={md(() => slashPick(x[0]))}
                    onMouseEnter={() => slash.idx !== i && setSlash({ ...slash, idx: i })}
                  >
                    <span className="ic">
                      {x.length > 4 ? <span className={x[5] === "serif" ? "g serif" : "g"}>{x[4]}</span> : <Svg>{I[x[0] as "image" | "table" | "video" | "file"]}</Svg>}
                    </span>
                    <span className="tx"><span className="l">{t(x[1])}</span><span className="d">{t(x[2])}</span></span>
                  </button>
                ))}
                {!items.length ? <div className="none">{t("ed.noMatches")}</div> : null}
              </div>
            ) : null}
          </div>
        </div>

        <aside className="edit-aside">
          <div className="card status-card">
            <div className="stack"><span className="eyebrow">{t("ed.status")}</span><span className="now">{statusText}</span></div>
            {props.translateInto.length && !cr ? (
              <div className="tx-hint"><Globe size={14} /><span>{t("ed.txHint", { langs: props.translateInto.join(", ") })}</span></div>
            ) : null}
            {error ? <div className="error-text" role="alert">{error}</div> : null}
          </div>
          <div className="card history-card" data-testid="editor-history">
            <div className="eyebrow">{t("ed.versionHistory")}</div>
            <div className="hrow draft">
              <span className="vdot" />
              <span className="vtext">
                {cr ? (
                  <>
                    <span className="vhead"><b>{t("ed.yourChanges")}</b><span>{t("ed.notSubmitted", { name: props.meName })}</span></span>
                    <span className="vnote">{t("ed.sentAs", { name: cr.lead })}</span>
                  </>
                ) : (
                  <>
                    <span className="vhead"><b>{t("ed.draftLabel")}</b><span>{saved ? t("ed.draftSavedMeta", { when: saved, name: props.meName }) : t("ed.draftNotSaved", { name: props.meName })}</span></span>
                    <span className={`vnote${draftNote ? "" : " muted"}`}>{draftNote || (saved ? t("ed.draftNoNote") : t("ed.draftNoteHint"))}</span>
                  </>
                )}
              </span>
            </div>
            {[...props.history].reverse().map((h) => (
              <div className="hrow" key={h.number}>
                <span className="vdot" />
                <span className="vtext"><span className="vhead"><b>v{h.number}</b><span>{h.date} · {h.by}</span></span><span className="vnote">{h.note}</span></span>
              </div>
            ))}
          </div>
          <div className="card detected-card" data-testid="detected-streams">
            <div className="row-head"><span className="eyebrow">{t("ed.streamsScores")}</span><span className="sub">{t("ed.detected")}</span></div>
            {props.scores.length ? (
              <div className="det-rows">
                {props.scores.map((s) => (
                  <div className="det-row" key={s.streamId}>
                    <span className="nm"><span className="dot dot-8" style={{ background: s.color }} /><span>{s.name}</span></span>
                    <span className="bar"><span style={{ width: `${s.score * 10}%`, background: s.color }} /></span>
                    <span className="val"><b>{formatScore(s.score, scale)}</b><span>{sfx}</span></span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="det-empty">{t("ed.noStreams")}</div>
            )}
            <span className="hint">{scoredBy === "author" ? t("ed.scoreHintAuthor") : t("ed.scoreHintReview")}</span>
          </div>
        </aside>
      </div>

      {dialog ? (
        <>
          <div className="dlg-scrim" onClick={() => setDialog(null)} />
          <div role="dialog" aria-modal="true" aria-label={t("sv.title")} className="save-dlg">
            <div className="dlg-head">
              <span className="eyebrow">{L ? t("sv.kickerDraft", { version: vn }) : t("sv.kickerNew")}</span>
              <h2>{t("sv.title")}</h2>
            </div>
            <div className="dlg-body">
              <div className="stack">
                <span className="lbl">{L ? t("sv.changesSince", { version: `v${L.number}` }) : t("sv.changes")}</span>
                {dialog.changes.length ? (
                  <ul className="chg-list">{dialog.changes.map((c, i) => <li key={i}><span className="dot" />{changeLabel(c, t, tn)}</li>)}</ul>
                ) : (
                  <span className="none">{L ? t("sv.nothingChanged", { version: `v${L.number}` }) : t("sv.firstVersion")}</span>
                )}
              </div>
              <label className="stack">
                <span className="lbl-row">
                  <span className="lbl">{t("sv.description")}</span>
                  {L && !dialog.busy && dialog.changes.length ? (
                    <button type="button" className="regen" onClick={() => { setDialog({ ...dialog, edited: false }); fillNote(content(), dialog.sig); }}>{t("sv.regenerate")}</button>
                  ) : null}
                </span>
                {dialog.busy ? (
                  <div className="writing"><span className="spinner" aria-hidden="true" />{t("sv.writing")}</div>
                ) : (
                  <textarea value={dialog.note} onChange={(e) => setDialog({ ...dialog, note: e.target.value, edited: true })} rows={2} placeholder={t("sv.placeholder")} />
                )}
                <span className="hint">{!L ? t("sv.hintNew") : dialog.busy ? "" : dialog.edited ? t("sv.hintEdited") : t("sv.hintAuto")}</span>
              </label>
            </div>
            <div className="dlg-foot">
              <button className="btn-secondary" onClick={() => setDialog(null)}>{t("ed.cancel")}</button>
              <button className="btn-primary" onClick={confirmSave} disabled={dialog.busy}>{t("sv.title")}</button>
            </div>
          </div>
        </>
      ) : null}

      {crDialog && cr ? (
        <>
          <div className="dlg-scrim" onClick={() => setCrDialog(null)} />
          <div role="dialog" aria-modal="true" aria-label={t("cd.submit")} className="save-dlg">
            <div className="dlg-head">
              <span className="eyebrow">{t("cd.kicker", { version: `v${cr.base}` })}</span>
              <h2>{t("cd.title")}</h2>
            </div>
            <div className="dlg-body">
              <div className="stack">
                <span className="lbl">{t("cd.changesSince", { version: `v${cr.base}` })}</span>
                <ul className="chg-list">{crDialog.changes.map((c, i) => <li key={i}><span className="dot" />{c}</li>)}</ul>
              </div>
              <label className="stack">
                <span className="lbl">{t("cd.description")}</span>
                {crDialog.busy ? (
                  <div className="writing"><span className="spinner" aria-hidden="true" />{t("cd.writing")}</div>
                ) : (
                  <textarea value={crDialog.note} onChange={(e) => setCrDialog({ ...crDialog, note: e.target.value, edited: true })} rows={2} placeholder={t("cd.placeholder")} />
                )}
                <span className="hint">{t("cd.hint", { name: cr.lead })}</span>
              </label>
            </div>
            <div className="dlg-foot">
              <button className="btn-secondary" onClick={() => setCrDialog(null)}>{t("ed.cancel")}</button>
              <button className="btn-primary" onClick={confirmCr} disabled={crDialog.busy || pending}>{t("cd.submit")}</button>
            </div>
          </div>
        </>
      ) : null}
    </main>
  );
}
