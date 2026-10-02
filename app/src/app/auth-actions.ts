"use server";

import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { endSession, initialsFor, startSession, verifyLogin } from "@/lib/auth";

export type FormState = { error?: string; info?: string; email?: string; name?: string };

const EMAIL_RE = /.+@.+\..+/;

export async function login(_prev: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  if (!EMAIL_RE.test(email)) return { error: "Enter a valid email address.", email };
  if (!password) return { error: "Enter your password.", email };
  const user = await verifyLogin(email, password);
  if (!user) return { error: "That email and password don't match an account.", email };
  await startSession(user.id);
  redirect("/");
}

export async function signup(_prev: FormState, form: FormData): Promise<FormState> {
  const name = String(form.get("name") ?? "").trim();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  if (!name) return { error: "Enter your full name.", email, name };
  if (!EMAIL_RE.test(email)) return { error: "Enter a valid email address.", email, name };
  if (password.length < 8) return { error: "Use a password of at least 8 characters.", email, name };
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing) return { error: "An account with this email already exists. Sign in instead.", email, name };
  const [u] = await db
    .insert(users)
    .values({ name, email, initials: initialsFor(name), role: "citizen", passwordHash: await bcrypt.hash(password, 10) })
    .returning({ id: users.id });
  await startSession(u.id);
  redirect("/");
}

export async function logout() {
  await endSession();
  redirect("/login");
}
