"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ensureTranslations } from "@/app/tx-actions";
import { useTxActivity } from "./TxActivity";

/**
 * Asks the server to translate texts that weren't in the cache when the page rendered, then refreshes so they show.
 * Renders nothing; `onFailed` lets a banner show the failure.
 */
export function TranslateMissing({ lang, texts, onFailed }: { lang: string; texts: string[]; onFailed?: () => void }) {
  const router = useRouter();
  const { track } = useTxActivity();
  const asked = useRef<string>("");
  const [, setTick] = useState(0);
  useEffect(() => {
    const key = lang + "|" + texts.join("\u0000");
    if (!texts.length || asked.current === key) return;
    asked.current = key;
    track(ensureTranslations(lang, texts)).then((r) => {
      if (r.ok) router.refresh();
      else onFailed?.();
      setTick((n) => n + 1);
    });
  }, [lang, texts, router, track, onFailed]);
  return null;
}
