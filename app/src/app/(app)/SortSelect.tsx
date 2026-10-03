"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useI18n } from "@/i18n/client";

export function SortSelect({ value, scoreLabel }: { value: string; scoreLabel: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { t } = useI18n();
  return (
    <label className="sort">
      {t("list.sort")}
      <select
        value={value}
        onChange={(e) => {
          const next = new URLSearchParams(params.toString());
          if (e.target.value === "recent") next.delete("sort"); else next.set("sort", e.target.value);
          const qs = next.toString();
          router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
        }}
      >
        <option value="recent">{t("list.sortRecent")}</option>
        <option value="discussed">{t("list.sortDiscussed")}</option>
        <option value="score">{scoreLabel}</option>
      </select>
    </label>
  );
}
