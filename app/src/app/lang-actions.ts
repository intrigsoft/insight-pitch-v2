"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { getLanguages, saveLanguagePreference } from "@/i18n/server";

/** Switches the reader's language (interface and content). Saved to their account, or a cookie before sign-in. */
export async function setLanguage(code: string) {
  const langs = await getLanguages();
  if (!langs.some((l) => l.code === code && l.enabled)) return { ok: false as const };
  const user = await getCurrentUser();
  await saveLanguagePreference(code, user?.id);
  revalidatePath("/", "layout");
  return { ok: true as const };
}
