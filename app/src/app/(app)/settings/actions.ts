"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { eq, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { comments, insightSources, proposalStreams, settings, streamLinks, streams } from "@/db/schema";
import { addToInsights } from "@/lib/discussion";
import { STREAM_COLORS } from "@/db/seed-data";
import { isAdmin, requireUser } from "@/lib/auth";

type Result = { ok: true } | { ok: false; error: string };

async function requireAdmin() {
  const user = await requireUser();
  if (!isAdmin(user)) throw new Error("Only administrators can change settings.");
  return user;
}

const pair = (a: string, b: string) => (a < b ? { a, b } : { a: b, b: a });

export type StreamInput = { id: string | null; name: string; description: string; color: string; active: boolean; related: string[] };

export async function saveStream(input: StreamInput): Promise<Result & { id?: string }> {
  await requireAdmin();
  const name = input.name.trim();
  if (!name) return { ok: false, error: "Give the stream a name." };
  if (name.length > 60) return { ok: false, error: "Keep the name under 60 characters." };
  const color = STREAM_COLORS.includes(input.color) ? input.color : STREAM_COLORS[0];
  const all = await db.select({ id: streams.id, name: streams.name, position: streams.position }).from(streams);
  if (all.some((s) => s.id !== input.id && s.name.toLowerCase() === name.toLowerCase())) return { ok: false, error: "A stream with this name already exists." };

  let id = input.id;
  if (id) {
    if (!all.some((s) => s.id === id)) return { ok: false, error: "This stream no longer exists." };
    await db.update(streams).set({ name, description: input.description.trim(), color, active: input.active }).where(eq(streams.id, id));
  } else {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "stream";
    id = all.some((s) => s.id === slug) ? `${slug}-${Date.now().toString(36)}` : slug;
    const position = Math.max(-1, ...all.map((s) => s.position)) + 1;
    await db.insert(streams).values({ id, name, description: input.description.trim(), color, active: input.active, position });
  }
  // Overlap links are symmetric: replace this stream's links with the chosen set.
  const related = [...new Set(input.related)].filter((r) => r !== id && all.some((s) => s.id === r));
  await db.delete(streamLinks).where(or(eq(streamLinks.a, id!), eq(streamLinks.b, id!)));
  if (related.length) await db.insert(streamLinks).values(related.map((r) => pair(id!, r)));
  revalidatePath("/", "layout");
  return { ok: true, id: id! };
}

export async function deleteStream(id: string): Promise<Result> {
  await requireAdmin();
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(proposalStreams).where(eq(proposalStreams.streamId, id));
  if ((r?.n ?? 0) > 0) return { ok: false, error: "This stream is used by proposals. Deactivate it instead." };
  await db.delete(streams).where(eq(streams.id, id));
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function setStreamActive(id: string, active: boolean): Promise<Result> {
  await requireAdmin();
  await db.update(streams).set({ active }).where(eq(streams.id, id));
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function linkStreams(a: string, b: string): Promise<Result> {
  await requireAdmin();
  if (a === b) return { ok: false, error: "Pick two different streams." };
  await db.insert(streamLinks).values(pair(a, b)).onConflictDoNothing();
  revalidatePath("/", "layout");
  return { ok: true };
}

const VALID: Record<string, (v: unknown) => boolean> = {
  scale: (v) => v === "5" || v === "10" || v === "100",
  scoredBy: (v) => v === "author" || v === "reviewers" || v === "both",
  requireStream: (v) => typeof v === "boolean",
  showPublic: (v) => typeof v === "boolean",
};

export async function updateSetting(key: string, value: string | boolean): Promise<Result> {
  await requireAdmin();
  if (!VALID[key]?.(value)) return { ok: false, error: "That setting value isn't allowed." };
  await db.insert(settings).values({ key, value }).onConflictDoUpdate({ target: settings.key, set: { value } });
  revalidatePath("/", "layout");
  return { ok: true };
}

/* Moderation */

/** Publishes a held or hidden comment. Reader flags stop counting once a moderator has reviewed it. */
export async function approveComment(id: string): Promise<Result> {
  const admin = await requireAdmin();
  const [c] = await db.select().from(comments).where(eq(comments.id, id)).limit(1);
  if (!c || c.status === "removed") return { ok: false, error: "That comment no longer exists." };
  await db.update(comments).set({ status: "visible", reviewedBy: admin.id, reviewedAt: new Date() }).where(eq(comments.id, id));
  after(() => addToInsights(id).catch((e) => console.warn("[insights]", e)));
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Takes a comment down. Insights it raised lose it as a source, and insights left with no source are removed. */
export async function removeComment(id: string): Promise<Result> {
  const admin = await requireAdmin();
  const [c] = await db.select().from(comments).where(eq(comments.id, id)).limit(1);
  if (!c) return { ok: false, error: "That comment no longer exists." };
  await db.update(comments).set({ status: "removed", reviewedBy: admin.id, reviewedAt: new Date() }).where(eq(comments.id, id));
  await db.delete(insightSources).where(eq(insightSources.commentId, id));
  await db.execute(sql`delete from insights i where i.proposal_id = ${c.proposalId} and not exists (select 1 from insight_sources s where s.insight_id = i.id)`);
  revalidatePath("/", "layout");
  return { ok: true };
}
