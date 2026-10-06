import type { T } from "@/i18n/core";

/** "Maya Chen with Daniel and Sam": who published a version, and the team members whose changes it includes. */
export function versionCredit(v: { byId: string | null; withIds: string[] }, names: Record<string, string>, t: T, locale: string, fallback = "") {
  const by = (v.byId && names[v.byId]) || fallback;
  if (!by) return "";
  const others = v.withIds.map((id) => names[id]?.split(" ")[0]).filter(Boolean);
  return others.length ? t("view.byWith", { name: by, others: new Intl.ListFormat(locale, { type: "conjunction" }).format(others) }) : by;
}
