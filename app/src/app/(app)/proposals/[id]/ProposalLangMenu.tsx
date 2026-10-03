"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/i18n/client";
import { Globe } from "@/components/LanguageMenu";

type Option = { code: string; native: string; name: string; href: string };

/** Lets a reader read this one proposal in a different language from the rest of the site. */
export function ProposalLangMenu({ current, source, options }: { current: string; source: string; options: Option[] }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  const translated = current !== source;
  const label = translated ? options.find((o) => o.code === current)?.native ?? current : t("view.translate");
  // The original first, then the other enabled languages.
  const ordered = [...options.filter((o) => o.code === source), ...options.filter((o) => o.code !== source)];
  return (
    <div className="menu-wrap plang" ref={ref}>
      <button className={`plang-btn${translated ? " on" : ""}`} onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} aria-label={t("view.translateProposal")}>
        <Globe size={15} /><span>{label}</span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {open ? (
        <div className="menu lang-menu plang-menu" role="menu">
          <div className="menu-label">{t("view.translateProposal")}</div>
          {ordered.map((o) => (
            <Link key={o.code} href={o.href} scroll={false} role="menuitemradio" aria-checked={o.code === current} className="lang-item" onClick={() => setOpen(false)}>
              <span className="names">
                <span className="native" lang={o.code === source ? undefined : o.code}>{o.code === source ? t("view.originalOption") : o.native}</span>
                <span className="sub" lang={o.code === source ? o.code : "en"}>{o.code === source ? o.native : o.name}</span>
              </span>
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
