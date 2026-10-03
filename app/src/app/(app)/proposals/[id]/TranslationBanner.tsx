"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useI18n } from "@/i18n/client";
import { useToast } from "@/components/Toast";
import { Globe } from "@/components/LanguageMenu";
import { TranslateMissing } from "@/components/TranslateMissing";
import { markTranslationsReviewed } from "@/app/tx-actions";

export type BannerProps =
  | { state: "original"; head: string; sub: string; toggleLabel: string; toggleHref: string }
  | {
      state: "ready";
      head: string;
      sub: string;
      chip?: string;
      chipReviewed?: boolean;
      chipWarn?: boolean;
      accuracy?: string;
      accuracyHelp?: string;
      toggleLabel: string;
      toggleHref: string;
      review?: { proposalId: string; lang: string; texts: string[] };
    }
  | { state: "translating"; head: string; sub: string; failedHead: string; failedSub: string; missing: { lang: string; texts: string[] } };

export function TranslationBanner(props: BannerProps) {
  const { t } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [pending, start] = useTransition();

  const translating = props.state === "translating";
  const head = translating && failed ? props.failedHead : props.head;
  const sub = translating && failed ? props.failedSub : props.sub;

  return (
    <div className="tx-banner" role="status" data-testid="translation-banner">
      {translating && !failed ? (
        <TranslateMissing
          key={attempt}
          lang={props.missing.lang}
          texts={props.missing.texts}
          onFailed={() => {
            setFailed(true);
            toast(t("tx.failedToast"));
          }}
        />
      ) : null}
      <div className="tx-top">
        <span className="tx-icon"><Globe size={17} /></span>
        <div className="tx-text">
          <span className="tx-head">{head}</span>
          <span className="tx-sub">{sub}</span>
          {props.state === "ready" && props.accuracy ? <span className="tx-accuracy" title={props.accuracyHelp} data-testid="tx-accuracy">{props.accuracy}</span> : null}
        </div>
        {props.state === "ready" && props.chip ? <span className={`pill ${props.chipReviewed ? "pill-green" : props.chipWarn ? "pill-red" : "pill-amber"} tx-chip`} data-testid="tx-chip">{props.chip}</span> : null}
      </div>
      {props.state !== "translating" || failed ? (
        <div className="tx-actions">
          {props.state !== "translating" ? <Link href={props.toggleHref} className="btn-secondary tx-btn" scroll={false}>{props.toggleLabel}</Link> : null}
          {props.state === "ready" && props.review ? (
            <button
              className="btn-primary tx-btn"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await markTranslationsReviewed(props.review!.proposalId, props.review!.lang, props.review!.texts);
                  toast(r.ok ? t("tx.markedReviewed") : r.error ?? t("err.generic"));
                  if (r.ok) router.refresh();
                })
              }
            >
              {t("tx.markReviewed")}
            </button>
          ) : null}
          {translating && failed ? (
            <button className="btn-primary tx-btn" onClick={() => { setFailed(false); setAttempt((a) => a + 1); }}>{t("tx.tryAgain")}</button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
