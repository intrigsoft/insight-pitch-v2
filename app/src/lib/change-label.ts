import type { Change } from "./body";
import type { MessageKey } from "@/i18n/en";
import type { T, TN } from "@/i18n/core";

/** A short label for one detected change, as shown in version history and the save dialog. */
export function changeLabel(c: Change, t: T, tn: TN) {
  switch (c.kind) {
    case "section": return t("chg.section", { text: c.text });
    case "added": return tn(`chg.added.${c.media}`, c.n);
    case "removed": return tn(`chg.removed.${c.media}`, c.n);
    case "text": return tn("chg.text", c.n);
    default: return t(`chg.${c.kind}` as MessageKey);
  }
}
