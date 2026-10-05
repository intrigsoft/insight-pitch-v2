"use client";

import { createContext, useContext, useState } from "react";
import { useToast } from "@/components/Toast";
import { useI18n } from "@/i18n/client";

// "Text only" hides images to save data. The choice is kept in a cookie so the server doesn't render images
// for readers who turned them off; tapping a hidden image loads just that one.

import { TEXT_ONLY_COOKIE } from "@/lib/body";

const Ctx = createContext<{ textOnly: boolean; setTextOnly: (v: boolean) => void; shown: Set<string>; show: (id: string) => void }>({
  textOnly: false, setTextOnly: () => {}, shown: new Set(), show: () => {},
});

export function TextOnlyProvider({ initial, children }: { initial: boolean; children: React.ReactNode }) {
  const [textOnly, set] = useState(initial);
  const [shown, setShown] = useState<Set<string>>(new Set());
  const setTextOnly = (v: boolean) => {
    document.cookie = `${TEXT_ONLY_COOKIE}=${v ? "1" : "0"}; path=/; max-age=31536000; samesite=lax`;
    set(v);
    setShown(new Set());
  };
  return <Ctx.Provider value={{ textOnly, setTextOnly, shown, show: (id) => setShown((s) => new Set(s).add(id)) }}>{children}</Ctx.Provider>;
}

export function TextOnlyButton() {
  const { textOnly, setTextOnly } = useContext(Ctx);
  const { t } = useI18n();
  const toast = useToast();
  return (
    <button
      type="button"
      className="btn-textonly"
      aria-pressed={textOnly}
      title={t("view.textOnlyTitle")}
      onClick={() => { setTextOnly(!textOnly); toast(textOnly ? t("view.imagesShown") : t("view.imagesHidden")); }}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 3l18 18" /><path d="M21 16V6a2 2 0 0 0-2-2H9M3 7v11a2 2 0 0 0 2 2h12" /></svg>
      {t("view.textOnly")}
    </button>
  );
}

export function BodyImage({ id, alt, caption, size }: { id: string; alt: string; caption: string; size: string }) {
  const { textOnly, shown, show } = useContext(Ctx);
  const { t } = useI18n();
  const visible = !textOnly || shown.has(id);
  return (
    <figure className="body-figure">
      {visible ? (
        <div className="body-img">
          {/* eslint-disable-next-line @next/next/no-img-element -- served by our upload route, not the image optimiser */}
          <img src={`/api/uploads/${id}`} alt={alt || t("view.image")} loading="lazy" />
        </div>
      ) : (
        <button type="button" className="body-img-hidden" onClick={() => show(id)}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6b736d" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="1.6" /><path d="m21 16-5-5-9 9" /></svg>
          <span className="alt">{alt || t("view.image")}</span>
          <span className="show">{t("view.showImage")}{size ? ` · ${size}` : ""}</span>
        </button>
      )}
      {caption ? <figcaption>{caption}</figcaption> : null}
    </figure>
  );
}
