"use client";

import { useTransition } from "react";
import { useToast } from "@/components/Toast";
import { linkStreams } from "./actions";
import { useI18n } from "@/i18n/client";

export function LinkButton({ a, b }: { a: string; b: string }) {
  const [pending, start] = useTransition();
  const toast = useToast();
  const { t } = useI18n();
  return (
    <button className="link-btn" disabled={pending} onClick={() => start(async () => {
      const r = await linkStreams(a, b);
      toast(r.ok ? t("set.linked") : r.error);
    })}>{t("set.link")}</button>
  );
}
