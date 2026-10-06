import "server-only";
import { and, asc, eq, inArray, ne } from "drizzle-orm";
import { db } from "@/db";
import {
  changeRequests,
  commentLikes,
  comments,
  proposalStreams,
  proposalVersions,
  proposals,
  teamBlocks,
  teamInvites,
  teamMembers,
  teamRequests,
  teamRoles,
  userStrengths,
  users,
} from "@/db/schema";

// Proposal teams. The lead edits and publishes; other members suggest changes through change requests.
// Others can ask to join (subject to the rules below) or be invited by the lead.

/** Limits on join requests, against spam. */
export const REQUEST_RULES = { perPerson: 5, cooldownDays: 30, noteMin: 20, noteMax: 280 } as const;
export const CAP_OPTIONS = [3, 5, 8, 12] as const;

export type TeamPerson = { id: string; name: string; initials: string; role: "admin" | "official" | "citizen" };

export type Team = {
  proposalId: string;
  authorId: string;
  leadId: string;
  joinMode: "open" | "roles" | "closed";
  cap: number | null;
  offer: { to: string; note: string; at: Date } | null;
  members: (TeamPerson & { streamId: string | null; joinedAt: Date })[];
  roles: { id: string; streamId: string; note: string }[];
  requests: (TeamPerson & { requestId: string; streamId: string | null; note: string; at: Date })[];
  invites: (TeamPerson & { inviteId: string; streamId: string | null; note: string; at: Date; fromId: string })[];
  blocked: TeamPerson[];
  /** When each person's last request was declined. */
  declined: Map<string, Date>;
};

const person = { id: users.id, name: users.name, initials: users.initials, role: users.role };

export async function getTeam(proposalId: string): Promise<Team | null> {
  const [p] = await db.select().from(proposals).where(eq(proposals.id, proposalId)).limit(1);
  if (!p) return null;
  const [members, roles, requests, invites, blocks] = await Promise.all([
    db.select({ ...person, streamId: teamMembers.streamId, joinedAt: teamMembers.joinedAt }).from(teamMembers).innerJoin(users, eq(users.id, teamMembers.userId)).where(eq(teamMembers.proposalId, proposalId)).orderBy(asc(teamMembers.joinedAt)),
    db.select({ id: teamRoles.id, streamId: teamRoles.streamId, note: teamRoles.note }).from(teamRoles).where(eq(teamRoles.proposalId, proposalId)).orderBy(asc(teamRoles.createdAt)),
    db.select({ ...person, requestId: teamRequests.id, streamId: teamRequests.streamId, note: teamRequests.note, at: teamRequests.createdAt }).from(teamRequests).innerJoin(users, eq(users.id, teamRequests.userId)).where(eq(teamRequests.proposalId, proposalId)).orderBy(asc(teamRequests.createdAt)),
    db.select({ ...person, inviteId: teamInvites.id, streamId: teamInvites.streamId, note: teamInvites.note, at: teamInvites.createdAt, fromId: teamInvites.fromId }).from(teamInvites).innerJoin(users, eq(users.id, teamInvites.userId)).where(eq(teamInvites.proposalId, proposalId)).orderBy(asc(teamInvites.createdAt)),
    db.select({ ...person, blocked: teamBlocks.blocked, declinedAt: teamBlocks.declinedAt }).from(teamBlocks).innerJoin(users, eq(users.id, teamBlocks.userId)).where(eq(teamBlocks.proposalId, proposalId)),
  ]);
  return {
    proposalId,
    authorId: p.authorId,
    leadId: p.leadId,
    joinMode: p.joinMode,
    cap: p.teamCap,
    offer: p.offerTo ? { to: p.offerTo, note: p.offerNote, at: p.offerAt ?? new Date() } : null,
    members,
    roles,
    requests,
    invites,
    blocked: blocks.filter((b) => b.blocked).map(({ id, name, initials, role }) => ({ id, name, initials, role })),
    declined: new Map(blocks.filter((b) => b.declinedAt).map((b) => [b.id, b.declinedAt!])),
  };
}

export const isMember = (t: Team, userId: string) => t.members.some((m) => m.id === userId);

/** Days left before someone whose request was declined can ask again, or 0. */
export function cooldownLeft(t: Team, userId: string, now = Date.now()) {
  const at = t.declined.get(userId);
  if (!at) return 0;
  const days = Math.floor((now - at.getTime()) / 86_400_000);
  return Math.max(0, REQUEST_RULES.cooldownDays - days);
}

/** Why the user can't ask to join right now, or null if they can. */
export function joinBlocker(t: Team, userId: string): { kind: "closed" } | { kind: "full" } | { kind: "cooldown"; days: number } | { kind: "noRoles" } | null {
  if (t.blocked.some((b) => b.id === userId) || t.joinMode === "closed") return { kind: "closed" };
  if (t.cap && t.members.length >= t.cap) return { kind: "full" };
  const days = cooldownLeft(t, userId);
  if (days) return { kind: "cooldown", days };
  if (t.joinMode === "roles" && !t.roles.length) return { kind: "noRoles" };
  return null;
}

export async function pendingRequestCount(userId: string) {
  const rows = await db.select({ id: teamRequests.id }).from(teamRequests).where(eq(teamRequests.userId, userId));
  return rows.length;
}

/** Proposal ids the user is on the team of, the ones they lead, and the ones they're invited to (who may see drafts). */
export async function membershipsOf(userId: string) {
  const [rows, inv] = await Promise.all([
    db.select({ proposalId: teamMembers.proposalId, leadId: proposals.leadId }).from(teamMembers).innerJoin(proposals, eq(proposals.id, teamMembers.proposalId)).where(eq(teamMembers.userId, userId)),
    db.select({ proposalId: teamInvites.proposalId }).from(teamInvites).where(eq(teamInvites.userId, userId)),
  ]);
  return {
    member: new Set(rows.map((r) => r.proposalId)),
    lead: new Set(rows.filter((r) => r.leadId === userId).map((r) => r.proposalId)),
    invited: new Set(inv.map((r) => r.proposalId)),
  };
}

/** Team sizes, for "and 2 others" in lists. */
export async function teamSizes(proposalIds: string[]) {
  if (!proposalIds.length) return new Map<string, number>();
  const rows = await db.select({ proposalId: teamMembers.proposalId }).from(teamMembers).where(inArray(teamMembers.proposalId, proposalIds));
  const out = new Map<string, number>();
  for (const r of rows) out.set(r.proposalId, (out.get(r.proposalId) ?? 0) + 1);
  return out;
}

/**
 * Stream strengths (1–10) for a set of people: Jev's reading when there is one, otherwise the profile formula
 * from the stream scores of proposals they published and how relevant and liked their comments were.
 * With `publicOnly`, people who keep their strengths private are left out.
 */
export async function strengthLevels(userIds: string[], { publicOnly = false } = {}): Promise<Map<string, Map<string, number>>> {
  const out = new Map<string, Map<string, number>>();
  if (!userIds.length) return out;
  const people = await db.select({ id: users.id, strengthsPublic: users.strengthsPublic }).from(users).where(inArray(users.id, userIds));
  const ids = people.filter((p) => !publicOnly || p.strengthsPublic).map((p) => p.id);
  if (!ids.length) return out;
  const stored = await db.select().from(userStrengths).where(inArray(userStrengths.userId, ids));
  for (const s of stored) {
    if (!out.has(s.userId)) out.set(s.userId, new Map());
    out.get(s.userId)!.set(s.streamId, Math.min(10, Math.max(1, Math.round(s.score))));
  }
  const rest = ids.filter((id) => !out.has(id));
  if (!rest.length) return out;

  const [published, scores, cmts] = await Promise.all([
    db.selectDistinct({ proposalId: proposalVersions.proposalId, leadId: proposals.leadId }).from(proposalVersions).innerJoin(proposals, eq(proposals.id, proposalVersions.proposalId)),
    db.select({ proposalId: proposalStreams.proposalId, streamId: proposalStreams.streamId, score: proposalStreams.score }).from(proposalStreams),
    db.select({ id: comments.id, authorId: comments.authorId, proposalId: comments.proposalId, relevance: comments.relevance }).from(comments).where(and(inArray(comments.authorId, rest), eq(comments.status, "visible"))),
  ]);
  const likes = cmts.length ? await db.select({ commentId: commentLikes.commentId }).from(commentLikes).where(inArray(commentLikes.commentId, cmts.map((c) => c.id))) : [];
  const pub = new Map(published.map((p) => [p.proposalId, p.leadId]));
  const scoresOf = (pid: string) => scores.filter((s) => s.proposalId === pid);
  for (const id of rest) {
    const raw = new Map<string, number>();
    const add = (sid: string, v: number) => raw.set(sid, (raw.get(sid) ?? 0) + v);
    for (const [pid, leadId] of pub) if (leadId === id) for (const s of scoresOf(pid)) add(s.streamId, s.score);
    for (const c of cmts) {
      if (c.authorId !== id || !pub.has(c.proposalId)) continue;
      const n = likes.filter((l) => l.commentId === c.id).length;
      for (const s of scoresOf(c.proposalId)) add(s.streamId, (s.score / 10) * ((c.relevance ?? 50) / 100) * 3 * (1 + Math.min(n, 10) * 0.1));
    }
    const levels = new Map<string, number>();
    for (const [sid, r] of raw) if (r >= 1) levels.set(sid, Math.max(1, Math.round(10 * (1 - Math.exp(-r / 8)))));
    out.set(id, levels);
  }
  return out;
}

export type CrRow = typeof changeRequests.$inferSelect & { authorName: string; authorInitials: string };

/** Change requests on a proposal, newest first, without withdrawn ones. */
export async function getChangeRequests(proposalId: string): Promise<CrRow[]> {
  return db
    .select({ cr: changeRequests, authorName: users.name, authorInitials: users.initials })
    .from(changeRequests)
    .innerJoin(users, eq(users.id, changeRequests.authorId))
    .where(and(eq(changeRequests.proposalId, proposalId), ne(changeRequests.status, "withdrawn")))
    .then((rows) => rows.map((r) => ({ ...r.cr, authorName: r.authorName, authorInitials: r.authorInitials })).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()));
}

export async function getChangeRequest(id: string): Promise<CrRow | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [r] = await db.select({ cr: changeRequests, authorName: users.name, authorInitials: users.initials }).from(changeRequests).innerJoin(users, eq(users.id, changeRequests.authorId)).where(eq(changeRequests.id, id)).limit(1);
  return r ? { ...r.cr, authorName: r.authorName, authorInitials: r.authorInitials } : null;
}
