"use server";

import { revalidatePath } from "next/cache";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { changeRequests, proposalDrafts, proposalVersions, proposals, streams, teamBlocks, teamInvites, teamMembers, teamRequests, teamRoles, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { changesOf, contentSig } from "@/lib/body";
import { aiNote, ruleNote } from "@/lib/detect";
import { applyDecisions, mergeRequest, type Decision } from "@/lib/merge";
import { CAP_OPTIONS, getTeam, isMember, joinBlocker, pendingRequestCount, REQUEST_RULES, type Team } from "@/lib/team";
import { getI18n } from "@/i18n/server";

type Result<T = object> = ({ ok: true; message?: string } & T) | { ok: false; error: string };

const first = (name: string) => name.split(" ")[0];
const done = (message?: string): Result => {
  revalidatePath("/", "layout");
  return { ok: true, message };
};

async function streamName(id: string | null) {
  if (!id) return "";
  const [s] = await db.select({ name: streams.name }).from(streams).where(eq(streams.id, id)).limit(1);
  return s?.name ?? "";
}

async function userName(id: string) {
  const [u] = await db.select({ name: users.name }).from(users).where(eq(users.id, id)).limit(1);
  return u?.name ?? "";
}

async function isPublished(proposalId: string) {
  const [v] = await db.select({ n: proposalVersions.number }).from(proposalVersions).where(eq(proposalVersions.proposalId, proposalId)).limit(1);
  return Boolean(v);
}

/** Loads the team for an action only its lead may take. */
async function asLead(proposalId: string): Promise<{ team: Team; userId: string } | { error: string }> {
  const user = await requireUser();
  const { t } = await getI18n();
  const team = await getTeam(proposalId);
  if (!team) return { error: t("err.notFound") };
  if (team.leadId !== user.id) return { error: t("tm.errNotLead") };
  return { team, userId: user.id };
}

/** Adds someone to the team, filling the open role for the stream they joined for. */
async function addMember(team: Team, userId: string, streamId: string | null) {
  await db.transaction(async (tx) => {
    await tx.insert(teamMembers).values({ proposalId: team.proposalId, userId, streamId }).onConflictDoNothing();
    await tx.delete(teamRequests).where(and(eq(teamRequests.proposalId, team.proposalId), eq(teamRequests.userId, userId)));
    await tx.delete(teamInvites).where(and(eq(teamInvites.proposalId, team.proposalId), eq(teamInvites.userId, userId)));
    if (streamId) await tx.delete(teamRoles).where(and(eq(teamRoles.proposalId, team.proposalId), eq(teamRoles.streamId, streamId)));
  });
  return Boolean(streamId && team.roles.some((r) => r.streamId === streamId));
}

/* Asking to join */

export async function askToJoin(proposalId: string, streamId: string | null, note: string): Promise<Result> {
  const user = await requireUser();
  const { t, tn } = await getI18n();
  const team = await getTeam(proposalId);
  if (!team) return { ok: false, error: t("err.notFound") };
  if (isMember(team, user.id)) return { ok: false, error: t("tm.errAlreadyMember") };
  if (!(await isPublished(proposalId))) return { ok: false, error: t("aj.errDraft") };
  if (team.requests.some((r) => r.id === user.id)) return { ok: false, error: t("aj.errPending") };
  const lead = await userName(team.leadId);
  const blocker = joinBlocker(team, user.id);
  if (blocker) {
    if (blocker.kind === "closed") return { ok: false, error: t("tm.closed", { name: first(lead) }) };
    if (blocker.kind === "full") return { ok: false, error: t("tm.full") };
    if (blocker.kind === "cooldown") return { ok: false, error: tn("tm.cooldown", blocker.days) };
    return { ok: false, error: t("tm.noRoles") };
  }
  // In "open roles" mode a request must be for one of the listed roles; in open mode it may also be general.
  const roleOk = streamId ? team.roles.some((r) => r.streamId === streamId) : team.joinMode === "open";
  if (!roleOk) return { ok: false, error: t("aj.errRole") };
  const text = note.trim();
  if (text.length < REQUEST_RULES.noteMin) return { ok: false, error: t("aj.errShort") };
  if (text.length > REQUEST_RULES.noteMax) return { ok: false, error: t("aj.errLong", { n: REQUEST_RULES.noteMax }) };
  if ((await pendingRequestCount(user.id)) >= REQUEST_RULES.perPerson) return { ok: false, error: t("aj.errLimit", { n: REQUEST_RULES.perPerson }) };
  await db.insert(teamRequests).values({ proposalId, userId: user.id, streamId, note: text }).onConflictDoNothing();
  return done(t("tm.requestSentToast", { name: first(lead) }));
}

export async function withdrawRequest(proposalId: string): Promise<Result> {
  const user = await requireUser();
  const { t } = await getI18n();
  await db.delete(teamRequests).where(and(eq(teamRequests.proposalId, proposalId), eq(teamRequests.userId, user.id)));
  return done(t("tm.requestWithdrawn"));
}

/* The lead handling requests */

async function findRequest(team: Team, requestId: string) {
  return team.requests.find((r) => r.requestId === requestId) ?? null;
}

export async function approveRequest(proposalId: string, requestId: string): Promise<Result> {
  const { t } = await getI18n();
  const lead = await asLead(proposalId);
  if ("error" in lead) return { ok: false, error: lead.error };
  const r = await findRequest(lead.team, requestId);
  if (!r) return { ok: false, error: t("tm.errGone") };
  if (lead.team.cap && lead.team.members.length >= lead.team.cap) return { ok: false, error: t("tmd.errFull", { name: first(r.name) }) };
  const filled = await addMember(lead.team, r.id, r.streamId);
  return done(filled ? t("tmd.roleFilled", { name: first(r.name), stream: await streamName(r.streamId) }) : t("tmd.joinedToast", { name: first(r.name) }));
}

export async function declineRequest(proposalId: string, requestId: string): Promise<Result> {
  const { t } = await getI18n();
  const lead = await asLead(proposalId);
  if ("error" in lead) return { ok: false, error: lead.error };
  const r = await findRequest(lead.team, requestId);
  if (!r) return { ok: false, error: t("tm.errGone") };
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.delete(teamRequests).where(eq(teamRequests.id, requestId));
    await tx.insert(teamBlocks).values({ proposalId, userId: r.id, declinedAt: now }).onConflictDoUpdate({ target: [teamBlocks.proposalId, teamBlocks.userId], set: { declinedAt: now } });
  });
  return done(t("tmd.declined", { name: first(r.name), n: REQUEST_RULES.cooldownDays }));
}

export async function blockRequest(proposalId: string, requestId: string): Promise<Result> {
  const { t } = await getI18n();
  const lead = await asLead(proposalId);
  if ("error" in lead) return { ok: false, error: lead.error };
  const r = await findRequest(lead.team, requestId);
  if (!r) return { ok: false, error: t("tm.errGone") };
  await db.transaction(async (tx) => {
    await tx.delete(teamRequests).where(eq(teamRequests.id, requestId));
    await tx.insert(teamBlocks).values({ proposalId, userId: r.id, blocked: true }).onConflictDoUpdate({ target: [teamBlocks.proposalId, teamBlocks.userId], set: { blocked: true } });
  });
  return done(t("tmd.blockedToast", { name: first(r.name) }));
}

export async function unblock(proposalId: string, userId: string): Promise<Result> {
  const { t } = await getI18n();
  const lead = await asLead(proposalId);
  if ("error" in lead) return { ok: false, error: lead.error };
  await db.update(teamBlocks).set({ blocked: false }).where(and(eq(teamBlocks.proposalId, proposalId), eq(teamBlocks.userId, userId)));
  return done(t("tmd.unblocked", { name: first(await userName(userId)) }));
}

/* Invites */

export async function sendInvite(proposalId: string, userId: string, streamId: string | null, note: string): Promise<Result> {
  const { t } = await getI18n();
  const lead = await asLead(proposalId);
  if ("error" in lead) return { ok: false, error: lead.error };
  const { team } = lead;
  if (!userId) return { ok: false, error: t("tmd.errChoose") };
  const name = first(await userName(userId));
  if (!name) return { ok: false, error: t("tmd.errChoose") };
  if (isMember(team, userId)) return { ok: false, error: t("tmd.errMember", { name }) };
  if (team.invites.some((i) => i.id === userId)) return { ok: false, error: t("tmd.errInvited", { name }) };
  if (team.requests.some((r) => r.id === userId)) return { ok: false, error: t("tmd.errAsked", { name }) };
  if (team.cap && team.members.length + team.invites.length >= team.cap) return { ok: false, error: t("tmd.errOverCap", { name }) };
  await db.insert(teamInvites).values({ proposalId, userId, fromId: lead.userId, streamId: streamId || null, note: note.trim().slice(0, 280) });
  return done(t("tmd.inviteSent", { name: await userName(userId) }));
}

export async function withdrawInvite(proposalId: string, inviteId: string): Promise<Result> {
  const { t } = await getI18n();
  const lead = await asLead(proposalId);
  if ("error" in lead) return { ok: false, error: lead.error };
  await db.delete(teamInvites).where(and(eq(teamInvites.id, inviteId), eq(teamInvites.proposalId, proposalId)));
  return done(t("tmd.inviteWithdrawn"));
}

export async function acceptInvite(proposalId: string): Promise<Result> {
  const user = await requireUser();
  const { t } = await getI18n();
  const team = await getTeam(proposalId);
  const inv = team?.invites.find((i) => i.id === user.id);
  if (!team || !inv) return { ok: false, error: t("tm.errInviteGone") };
  await addMember(team, user.id, inv.streamId);
  return done(t("tm.joined"));
}

export async function declineInvite(proposalId: string): Promise<Result> {
  const user = await requireUser();
  const { t } = await getI18n();
  await db.delete(teamInvites).where(and(eq(teamInvites.proposalId, proposalId), eq(teamInvites.userId, user.id)));
  return done(t("tm.inviteDeclined"));
}

/* Roles and joining rules */

export async function addRole(proposalId: string, streamId: string, note: string): Promise<Result> {
  const { t } = await getI18n();
  const lead = await asLead(proposalId);
  if ("error" in lead) return { ok: false, error: lead.error };
  if (!streamId || !(await streamName(streamId))) return { ok: false, error: t("tmd.errRoleStream") };
  await db.insert(teamRoles).values({ proposalId, streamId, note: note.trim().slice(0, 200) }).onConflictDoUpdate({ target: [teamRoles.proposalId, teamRoles.streamId], set: { note: note.trim().slice(0, 200) } });
  return done(t("tmd.roleAdded"));
}

export async function removeRole(proposalId: string, roleId: string): Promise<Result> {
  const lead = await asLead(proposalId);
  if ("error" in lead) return { ok: false, error: lead.error };
  await db.delete(teamRoles).where(and(eq(teamRoles.id, roleId), eq(teamRoles.proposalId, proposalId)));
  return done();
}

export async function setJoinRules(proposalId: string, rules: { mode?: Team["joinMode"]; cap?: number | null }): Promise<Result> {
  const lead = await asLead(proposalId);
  if ("error" in lead) return { ok: false, error: lead.error };
  const set: Partial<typeof proposals.$inferInsert> = {};
  if (rules.mode && ["open", "roles", "closed"].includes(rules.mode)) set.joinMode = rules.mode;
  if (rules.cap === null || (rules.cap !== undefined && (CAP_OPTIONS as readonly number[]).includes(rules.cap))) set.teamCap = rules.cap;
  if (Object.keys(set).length) await db.update(proposals).set(set).where(eq(proposals.id, proposalId));
  return done();
}

/* Members and the lead role */

export async function removeMember(proposalId: string, userId: string): Promise<Result> {
  const { t } = await getI18n();
  const lead = await asLead(proposalId);
  if ("error" in lead) return { ok: false, error: lead.error };
  if (userId === lead.team.leadId) return { ok: false, error: t("tm.errRemoveLead") };
  await db.transaction(async (tx) => {
    await tx.delete(teamMembers).where(and(eq(teamMembers.proposalId, proposalId), eq(teamMembers.userId, userId)));
    if (lead.team.offer?.to === userId) await tx.update(proposals).set({ offerTo: null, offerNote: "", offerAt: null }).where(eq(proposals.id, proposalId));
  });
  return done(t("tmd.removed", { name: first(await userName(userId)) }));
}

export async function leaveTeam(proposalId: string): Promise<Result> {
  const user = await requireUser();
  const { t } = await getI18n();
  const team = await getTeam(proposalId);
  if (!team || !isMember(team, user.id)) return { ok: false, error: t("err.notFound") };
  if (team.leadId === user.id) return { ok: false, error: t("tm.errLeadLeave") };
  await db.transaction(async (tx) => {
    await tx.delete(teamMembers).where(and(eq(teamMembers.proposalId, proposalId), eq(teamMembers.userId, user.id)));
    if (team.offer?.to === user.id) await tx.update(proposals).set({ offerTo: null, offerNote: "", offerAt: null }).where(eq(proposals.id, proposalId));
  });
  return done(t("tm.left"));
}

export async function offerLead(proposalId: string, userId: string, note = ""): Promise<Result> {
  const { t } = await getI18n();
  const lead = await asLead(proposalId);
  if ("error" in lead) return { ok: false, error: lead.error };
  if (!isMember(lead.team, userId) || userId === lead.userId) return { ok: false, error: t("tm.errNotMember") };
  await db.update(proposals).set({ offerTo: userId, offerNote: note.trim().slice(0, 280), offerAt: new Date() }).where(eq(proposals.id, proposalId));
  return done(t("tmd.offeredToast", { name: first(await userName(userId)) }));
}

export async function withdrawOffer(proposalId: string): Promise<Result> {
  const { t } = await getI18n();
  const lead = await asLead(proposalId);
  if ("error" in lead) return { ok: false, error: lead.error };
  await db.update(proposals).set({ offerTo: null, offerNote: "", offerAt: null }).where(eq(proposals.id, proposalId));
  return done(t("tmd.offerWithdrawn"));
}

/** The offered member takes over as lead. The old lead stays on the team as a contributor. */
export async function acceptOffer(proposalId: string): Promise<Result> {
  const user = await requireUser();
  const { t } = await getI18n();
  const team = await getTeam(proposalId);
  if (!team || team.offer?.to !== user.id || !isMember(team, user.id)) return { ok: false, error: t("tm.errOfferGone") };
  await db.update(proposals).set({ leadId: user.id, offerTo: null, offerNote: "", offerAt: null }).where(and(eq(proposals.id, proposalId), eq(proposals.offerTo, user.id)));
  return done(t("tm.nowLead", { name: first(await userName(team.leadId)) }));
}

export async function declineOffer(proposalId: string): Promise<Result> {
  const user = await requireUser();
  const { t } = await getI18n();
  const team = await getTeam(proposalId);
  if (!team || team.offer?.to !== user.id) return { ok: false, error: t("tm.errOfferGone") };
  await db.update(proposals).set({ offerTo: null, offerNote: "", offerAt: null }).where(eq(proposals.id, proposalId));
  return done(t("tm.staysLead", { name: first(await userName(team.leadId)) }));
}

/* Change requests */

async function versionContent(proposalId: string, number?: number) {
  const q = db
    .select({ number: proposalVersions.number, title: proposalVersions.title, summary: proposalVersions.summary, body: proposalVersions.body })
    .from(proposalVersions);
  const [v] = number
    ? await q.where(and(eq(proposalVersions.proposalId, proposalId), eq(proposalVersions.number, number))).limit(1)
    : await q.where(eq(proposalVersions.proposalId, proposalId)).orderBy(desc(proposalVersions.number)).limit(1);
  return v ?? null;
}

export type CrInput = { proposalId: string; crId: string | null; base: number; title: string; summary: string; body: string; note: string };

/** The change list and an automatic description for a change request, shown in the submit dialog. */
export async function describeChangeRequest(input: Omit<CrInput, "note" | "crId">): Promise<Result<{ changes: string[]; note: string }>> {
  await requireUser();
  const { t, tn } = await getI18n();
  const base = await versionContent(input.proposalId, input.base);
  if (!base) return { ok: false, error: t("err.notFound") };
  const cur = { title: input.title.trim(), summary: input.summary.trim(), body: input.body };
  const changes = changesOf(base, cur);
  const labels = changes.map((c) => ruleNote([c], t, tn));
  const note = changes.length ? (await aiNote(base, cur, labels)) ?? ruleNote(changes, t, tn) : "";
  return { ok: true, changes: labels, note };
}

export async function submitChangeRequest(input: CrInput): Promise<Result<{ id: string }>> {
  const user = await requireUser();
  const { t, tn } = await getI18n();
  const team = await getTeam(input.proposalId);
  if (!team || !isMember(team, user.id)) return { ok: false, error: t("cd.errNotMember") };
  const base = await versionContent(input.proposalId, input.base);
  if (!base) return { ok: false, error: t("err.notFound") };
  const cur = { title: input.title.trim(), summary: input.summary.trim(), body: input.body.trim() };
  if (!cur.title) return { ok: false, error: t("cd.errTitle") };
  const changes = changesOf(base, cur);
  if (!changes.length) return { ok: false, error: t("cd.errNothing", { version: `v${base.number}` }) };
  const note = input.note.trim().slice(0, 300) || ruleNote(changes, t, tn);
  const now = new Date();
  let id = input.crId;
  if (id) {
    // Updating a request that was sent back: it goes back to the lead as open.
    const [existing] = await db.select().from(changeRequests).where(eq(changeRequests.id, id)).limit(1);
    if (!existing || existing.authorId !== user.id || existing.proposalId !== input.proposalId || !["open", "returned"].includes(existing.status)) return { ok: false, error: t("rv.errNotOpen") };
    await db.update(changeRequests).set({ ...cur, note, baseVersion: base.number, status: "open", updatedAt: now }).where(eq(changeRequests.id, id));
  } else {
    [{ id }] = await db.insert(changeRequests).values({ proposalId: input.proposalId, authorId: user.id, baseVersion: base.number, ...cur, note, createdAt: now, updatedAt: now }).returning({ id: changeRequests.id });
  }
  revalidatePath("/", "layout");
  const lead = await userName(team.leadId);
  return { ok: true, id: id!, message: team.leadId === user.id ? t("cd.added") : t("cd.sent", { name: first(lead) }) };
}

/** What the change request is merged into: the lead's draft, or the latest version when there's no draft. */
async function leadContent(proposalId: string) {
  const [d] = await db.select().from(proposalDrafts).where(eq(proposalDrafts.proposalId, proposalId)).limit(1);
  if (d) return { draft: d, doc: { title: d.title, summary: d.summary, body: d.body } };
  const v = await versionContent(proposalId);
  return { draft: null, doc: v ? { title: v.title, summary: v.summary, body: v.body } : null };
}

/**
 * Merges the accepted changes into the lead's draft. `oursSig` is the content the lead reviewed against, so a draft
 * saved in the meantime (in another tab) doesn't get changes applied to the wrong paragraphs.
 */
export async function mergeChangeRequest(crId: string, dec: Record<number, Decision>, edits: Record<number, string>, oursSig: string): Promise<Result<{ proposalId: string }>> {
  const user = await requireUser();
  const { t, tn } = await getI18n();
  const [cr] = await db.select().from(changeRequests).where(eq(changeRequests.id, crId)).limit(1);
  if (!cr) return { ok: false, error: t("rv.gone") };
  const team = await getTeam(cr.proposalId);
  if (!team || team.leadId !== user.id) return { ok: false, error: t("tm.errNotLead") };
  if (cr.status !== "open") return { ok: false, error: t("rv.errNotOpen") };
  const base = await versionContent(cr.proposalId, cr.baseVersion);
  const { draft, doc: ours } = await leadContent(cr.proposalId);
  if (!base || !ours) return { ok: false, error: t("err.notFound") };
  if (contentSig(ours) !== oursSig) return { ok: false, error: t("rv.errStale") };
  const { chunks } = mergeRequest(base, ours, cr);
  const merged = applyDecisions(chunks, dec, edits, ours);
  if (!merged) return { ok: false, error: t("rv.decideAll") };
  const now = new Date();
  await db.transaction(async (tx) => {
    if (merged.accepted) {
      const contributors = [...new Set([...(draft?.contributors ?? []), cr.authorId])];
      const row = { ...merged.doc, contributors, savedAt: now };
      if (draft) await tx.update(proposalDrafts).set(row).where(eq(proposalDrafts.proposalId, cr.proposalId));
      else await tx.insert(proposalDrafts).values({ proposalId: cr.proposalId, ...row });
      await tx.update(proposals).set({ updatedAt: now }).where(eq(proposals.id, cr.proposalId));
    }
    await tx.update(changeRequests).set({ status: merged.accepted ? "merged" : "closed", accepted: merged.accepted, total: merged.total, updatedAt: now }).where(eq(changeRequests.id, crId));
  });
  revalidatePath("/", "layout");
  return { ok: true, proposalId: cr.proposalId, message: merged.accepted ? tn("rv.merged", merged.accepted) : t("rv.closedNothing") };
}

/** Send back (lead), close (lead) or withdraw (author). */
export async function setChangeRequestStatus(crId: string, status: "returned" | "closed" | "withdrawn"): Promise<Result<{ proposalId: string }>> {
  const user = await requireUser();
  const { t } = await getI18n();
  const [cr] = await db.select().from(changeRequests).where(eq(changeRequests.id, crId)).limit(1);
  if (!cr) return { ok: false, error: t("rv.gone") };
  const team = await getTeam(cr.proposalId);
  if (!team) return { ok: false, error: t("rv.gone") };
  const allowed = status === "withdrawn" ? cr.authorId === user.id && ["open", "returned"].includes(cr.status) : team.leadId === user.id && cr.status === "open";
  if (!allowed) return { ok: false, error: t("rv.errNotOpen") };
  await db.update(changeRequests).set({ status, updatedAt: new Date() }).where(eq(changeRequests.id, crId));
  revalidatePath("/", "layout");
  const author = first(await userName(cr.authorId));
  return { ok: true, proposalId: cr.proposalId, message: status === "returned" ? t("rv.sentBack", { name: author }) : status === "closed" ? t("rv.closedToast") : t("rv.withdrawn") };
}
