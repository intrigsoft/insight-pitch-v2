"use server";

import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { endSession, initialsFor, startSession, verifyLogin } from "@/lib/auth";
import { getI18n, getLang } from "@/i18n/server";

export type FormState = { error?: string; info?: string; email?: string; name?: string };

const EMAIL_RE = /.+@.+\..+/;

export async function login(_prev: FormState, form: FormData): Promise<FormState> {
  const { t } = await getI18n();
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  if (!EMAIL_RE.test(email)) return { error: t("auth.errEmail"), email };
  if (!password) return { error: t("auth.errPassword"), email };
  const user = await verifyLogin(email, password);
  if (!user) return { error: t("auth.errMismatch"), email };
  await startSession(user.id);
  redirect("/");
}

export async function signup(_prev: FormState, form: FormData): Promise<FormState> {
  const { t } = await getI18n();
  const name = String(form.get("name") ?? "").trim();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  if (!name) return { error: t("auth.errName"), email, name };
  if (!EMAIL_RE.test(email)) return { error: t("auth.errEmail"), email, name };
  if (password.length < 8) return { error: t("auth.errPasswordLength"), email, name };
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing) return { error: t("auth.errExists"), email, name };
  const [u] = await db
    .insert(users)
    // New accounts keep the language they signed up in.
    .values({ name, email, initials: initialsFor(name), role: "citizen", language: await getLang(), passwordHash: await bcrypt.hash(password, 10) })
    .returning({ id: users.id });
  await startSession(u.id);
  redirect("/");
}

export async function logout() {
  await endSession();
  redirect("/login");
}
