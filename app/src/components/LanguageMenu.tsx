"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { useI18n } from "@/i18n/client";
import { setLanguage } from "@/app/lang-actions";
import { useTxActivity } from "./TxActivity";

export type MenuLanguage = { code: string; name: string; native: string };

const Globe = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9s1.3-6.4 3.8-9z" /></svg>
);
export { Globe };

export function LanguageMenu({ languages, defaultLanguage, canManage }: { languages: MenuLanguage[]; defaultLanguage: string; canManage: boolean }) {
  const { t, lang } = useI18n();
  const router = useRouter();
  const { busy } = useTxActivity();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [open]);

  const choose = (code: string) =>
    start(async () => {
      setOpen(false);
      if (code === lang) return;
      await setLanguage(code);
      router.refresh();
    });

  return (
    <>
      {busy > 0 || pending ? <span className="tx-busy" role="status">{t("header.translating")}</span> : null}
      <div className="menu-wrap" ref={ref}>
        <button
          className={`lang-btn${lang !== defaultLanguage ? " on" : ""}`}
          onClick={() => setOpen((o) => !o)}
          title={t("header.readingLanguage")}
          aria-label={t("header.readingLanguage")}
          aria-haspopup="menu"
          aria-expanded={open}
        >
          <Globe />
          <span>{lang.toUpperCase()}</span>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
        </button>
        {open ? (
          <div className="menu lang-menu" role="menu">
            <div className="menu-label">{t("header.readIn")}</div>
            {languages.map((l) => (
              <button key={l.code} role="menuitemradio" aria-checked={l.code === lang} lang={l.code} className="lang-item" onClick={() => choose(l.code)}>
                <span className="names"><span className="native">{l.native}</span><span className="sub" lang="en">{l.name}</span></span>
                {l.code === lang ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12 5 5 9-10" /></svg> : null}
              </button>
            ))}
            {canManage ? (
              <div className="menu-foot"><Link href="/settings?tab=languages" className="menu-item manage" onClick={() => setOpen(false)}>{t("header.manageLanguages")}</Link></div>
            ) : null}
          </div>
        ) : null}
      </div>
    </>
  );
}
