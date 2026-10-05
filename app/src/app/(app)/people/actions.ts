"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { userFollows, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { catalogEntry } from "@/lib/languages";
import { getI18n } from "@/i18n/server";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

export type ProfileInput = { name: string; title: string; org: string; location: string; bio: string; reads: string[] };

const BIO_MAX = 280;

const initialsFor = (name: string) =>
  name.split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase();

export async function saveProfile(input: ProfileInput): Promise<Result> {
  const user = await requireUser();
  const { t } = await getI18n();
  const name = input.name.trim().slice(0, 120);
  const bio = input.bio.trim();
  const reads = [...new Set(input.reads)].filter((c) => catalogEntry(c));
  if (!name) return { ok: false, error: t("prof.edit.errName") };
  if (bio.length > BIO_MAX) return { ok: false, error: t("prof.edit.errBio") };
  if (!reads.length) return { ok: false, error: t("prof.edit.errReads") };
  await db
    .update(users)
    .set({ name, initials: initialsFor(name), title: input.title.trim().slice(0, 120), org: input.org.trim().slice(0, 160), location: input.location.trim().slice(0, 120), bio, reads })
    .where(eq(users.id, user.id));
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function togglePersonFollow(personId: string): Promise<Result<{ following: boolean }>> {
  const user = await requireUser();
  if (personId === user.id) return { ok: false, error: "" };
  const [person] = await db.select({ id: users.id }).from(users).where(eq(users.id, personId)).limit(1);
  if (!person) return { ok: false, error: "" };
  const where = and(eq(userFollows.followerId, user.id), eq(userFollows.followeeId, personId));
  const [existing] = await db.select().from(userFollows).where(where).limit(1);
  if (existing) await db.delete(userFollows).where(where);
  else await db.insert(userFollows).values({ followerId: user.id, followeeId: personId });
  revalidatePath(`/people/${personId}`);
  return { ok: true, following: !existing };
}

export async function setStrengthsPublic(value: boolean): Promise<Result> {
  const user = await requireUser();
  await db.update(users).set({ strengthsPublic: value }).where(eq(users.id, user.id));
  revalidatePath(`/people/${user.id}`);
  return { ok: true };
}
