"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

export function SortSelect({ value, scoreLabel }: { value: string; scoreLabel: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  return (
    <label className="sort">
      Sort
      <select
        value={value}
        onChange={(e) => {
          const next = new URLSearchParams(params.toString());
          if (e.target.value === "recent") next.delete("sort"); else next.set("sort", e.target.value);
          const qs = next.toString();
          router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
        }}
      >
        <option value="recent">Recently updated</option>
        <option value="discussed">Most discussed</option>
        <option value="score">{scoreLabel}</option>
      </select>
    </label>
  );
}
