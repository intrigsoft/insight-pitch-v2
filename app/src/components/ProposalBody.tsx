import { fileBadge, hostOf, parseBody, segs } from "@/lib/body";
import { BodyImage } from "@/app/(app)/proposals/[id]/Media";

type Props = {
  body: string;
  /** Text in the reader's language. */
  T: (text: string) => string;
  /** Hover title and low-accuracy marking for translated paragraphs. */
  accuracy?: (text: string) => { title?: string; low: boolean; lowNote?: string };
  /** Size line for attachments, e.g. "86 KB · added in v2". */
  fileMeta: (id: string, size: string) => string;
  labels: { video: string };
};

const Inline = ({ text }: { text: string }) => (
  <>
    {segs(text).map((s, i) =>
      s.href ? <a key={i} href={s.href} target="_blank" rel="noopener noreferrer">{s.text}</a> : s.b ? <strong key={i}>{s.text}</strong> : s.i ? <em key={i}>{s.text}</em> : <span key={i}>{s.text}</span>,
    )}
  </>
);

const Arrow = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6b736d" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></svg>
);
const Download = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#4f5751" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></svg>
);

/** A proposal body as readers see it. */
export function ProposalBody({ body, T, accuracy, fileMeta, labels }: Props) {
  return parseBody(body).map((b, k) => {
    switch (b.type) {
      case "h": {
        const a = accuracy?.(b.text);
        return <h3 key={k} title={a?.title}>{T(b.text)}</h3>;
      }
      case "p": {
        const a = accuracy?.(b.text);
        return (
          <p key={k} title={a?.title} className={a?.low ? "tx-low" : undefined}>
            {a?.low ? <span className="tx-low-note">{a.lowNote}</span> : null}
            <Inline text={T(b.text)} />
          </p>
        );
      }
      case "quote": return <blockquote key={k}><Inline text={T(b.text)} /></blockquote>;
      case "ul":
      case "ol":
        return (
          <ul key={k} className="body-list">
            {b.items.map((x, j) => <li key={j}><span className="mk">{b.type === "ol" ? `${j + 1}.` : "•"}</span><span className="tx"><Inline text={T(x)} /></span></li>)}
          </ul>
        );
      case "table": {
        const nc = Math.max(...b.rows.map((r) => r.length));
        // Columns of numbers line up on the right, like the design.
        const numeric = (ci: number) => ci > 0 && b.rows.length > 1 && b.rows.slice(1).every((r) => /^[\d.,%\s–-]/.test(r[ci] || ""));
        return (
          <div key={k} className="body-table">
            <table>
              <thead><tr>{Array.from({ length: nc }, (_, ci) => <th key={ci} className={numeric(ci) ? "num" : undefined}>{T(b.rows[0][ci] || "")}</th>)}</tr></thead>
              <tbody>
                {b.rows.slice(1).map((r, ri) => (
                  <tr key={ri}>{Array.from({ length: nc }, (_, ci) => <td key={ci} className={numeric(ci) ? "num" : undefined}>{T(r[ci] || "")}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }
      case "image": return <BodyImage key={k} id={b.id} alt={T(b.alt)} caption={T(b.caption)} size={b.size} />;
      case "video":
        return (
          <a key={k} className="body-video" href={b.url} target="_blank" rel="noopener noreferrer">
            <span className="play"><svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l12.5-7.5z" fill="currentColor" /></svg></span>
            <span className="tx"><span className="t">{T(b.title) || b.url}</span><span className="m">{[labels.video, b.dur, hostOf(b.url)].filter(Boolean).join(" · ")}</span></span>
            <Arrow />
          </a>
        );
      case "file": {
        const fb = fileBadge(b.name);
        return (
          <a key={k} className="body-file" href={`/api/uploads/${b.id}`} download={b.name}>
            <span className={`file-badge ${fb.kind}`}>{fb.ext}</span>
            <span className="tx"><span className="t">{b.name}</span><span className="m">{fileMeta(b.id, b.size)}</span></span>
            <Download />
          </a>
        );
      }
    }
  });
}
