import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import type { CurrentUser } from "@/lib/auth";
import type { ProposalDetail, Stream } from "@/lib/data";
import { shortDate, timeAgo } from "@/lib/format";
import { formatScore, scaleSuffix, type Scale } from "@/lib/scale";
import { mergeRequest } from "@/lib/merge";
import { CAP_OPTIONS, getChangeRequests, getTeam, joinBlocker, pendingRequestCount, REQUEST_RULES, strengthLevels } from "@/lib/team";
import type { getI18n } from "@/i18n/server";

type I18n = Awaited<ReturnType<typeof getI18n>>;
const first = (name: string) => name.split(" ")[0];

export type TeamCardView = Awaited<ReturnType<typeof buildTeamView>>;

/** Everything the team card, the ask-to-join dialog and the lead's Manage team drawer show. */
export async function buildTeamView(p: ProposalDetail, user: CurrentUser, streams: Stream[], scale: Scale, i18n: I18n, streamName: (s: Stream) => string) {
  const { t, tn, locale } = i18n;
  const team = (await getTeam(p.id))!;
  const latest = p.versions.at(-1) ?? null;
  const isLead = team.leadId === user.id;
  const member = team.members.some((m) => m.id === user.id);
  const sfx = scaleSuffix(scale);
  const st = (id: string | null) => streams.find((s) => s.id === id) ?? null;
  const sName = (id: string | null) => {
    const s = st(id);
    return s ? streamName(s) : "";
  };
  const leadName = team.members.find((m) => m.id === team.leadId)?.name ?? p.author.name;
  const nameOf = (m: { id: string; name: string }) => (m.id === user.id ? t("tm.you", { name: m.name }) : m.name);
  const byLead = <T extends { id: string }>(a: T[]) => [...a].sort((x, y) => Number(y.id === team.leadId) - Number(x.id === team.leadId));

  const members = byLead(team.members).map((m) => {
    const isL = m.id === team.leadId;
    const parts: string[] = [];
    if (m.streamId) parts.push(sName(m.streamId));
    else if (!isL) parts.push(t("tm.contributor"));
    if (m.role === "official") parts.push(t("tm.official"));
    if (m.id === team.authorId) parts.push(t("tm.started"));
    return { id: m.id, name: nameOf(m), initials: m.initials, sub: parts.join(" · ") || t("tm.lead"), isLead: isL, isMe: m.id === user.id };
  });

  const offer = member && team.offer?.to === user.id ? { from: leadName, note: team.offer.note, hint: t("tm.offerHint", { name: first(leadName) }) } : null;
  const inv = !member ? team.invites.find((i) => i.id === user.id) : undefined;
  const fromName = inv ? (await db.select({ name: users.name }).from(users).where(eq(users.id, inv.fromId)).limit(1))[0]?.name ?? leadName : "";
  const invite = inv ? { from: fromName, line: inv.streamId ? t("tm.inviteLineFor", { name: fromName, stream: sName(inv.streamId) }) : t("tm.inviteLine", { name: fromName }), note: inv.note } : null;

  // Joining: only for people who aren't on the team, once the proposal is published.
  let join: { kind: "ask" } | { kind: "pending"; line: string } | { kind: "info"; text: string } | null = null;
  const myReq = team.requests.find((r) => r.id === user.id);
  if (!member && latest && !inv) {
    if (myReq) join = { kind: "pending", line: [t("tm.requestSent", { when: timeAgo(myReq.at, i18n) }), sName(myReq.streamId)].filter(Boolean).join(" · ") };
    else {
      const b = joinBlocker(team, user.id);
      join = !b
        ? { kind: "ask" }
        : { kind: "info", text: b.kind === "closed" ? t("tm.closed", { name: first(leadName) }) : b.kind === "full" ? t("tm.full") : b.kind === "cooldown" ? tn("tm.cooldown", b.days) : t("tm.noRoles") };
    }
  }

  const openRoles = team.roles.map((r) => ({ id: r.id, streamId: r.streamId, name: sName(r.streamId), color: st(r.streamId)?.color ?? "#9a9f98", note: r.note }));

  // The ask dialog: the roles to choose from, with the asker's own strength in each.
  let ask = null;
  if (join?.kind === "ask") {
    const mine = (await strengthLevels([user.id])).get(user.id) ?? new Map();
    const roles = openRoles.map((r) => ({ streamId: r.streamId, name: r.name, color: r.color, note: r.note, strength: mine.get(r.streamId) ? t("aj.yourStrength", { value: formatScore(mine.get(r.streamId)!, scale), suffix: sfx }) : "" }));
    if (team.joinMode === "open") roles.push({ streamId: "", name: t("aj.general"), color: "#9a9f98", note: t("aj.generalNote"), strength: "" });
    const pending = await pendingRequestCount(user.id);
    ask = {
      title: (latest ?? p.draft)!.title,
      intro: t("aj.intro", { name: first(leadName) }),
      roles,
      defaultStream: team.joinMode === "roles" ? openRoles[0]?.streamId ?? "" : "",
      footnote: t("aj.footnote", { n: pending, max: REQUEST_RULES.perPerson, name: first(leadName), days: REQUEST_RULES.cooldownDays }),
      noteMax: REQUEST_RULES.noteMax,
      noteMin: REQUEST_RULES.noteMin,
    };
  }

  const drawer = isLead ? await buildDrawer() : null;

  async function buildDrawer() {
    const taken = (id: string) =>
      team.members.some((m) => m.id === id) || team.invites.some((i) => i.id === id) || team.requests.some((r) => r.id === id) || team.blocked.some((b) => b.id === id);
    const everyone = await db.select({ id: users.id, name: users.name, role: users.role }).from(users).where(eq(users.voterOnly, false)).orderBy(users.name);
    const candidates = everyone.filter((u) => !taken(u.id));
    // Strengths of people who asked, and of people who could fill an open role. Private strengths aren't shown.
    const levels = await strengthLevels([...team.requests.map((r) => r.id), ...candidates.map((c) => c.id)], { publicOnly: true });
    const lvl = (uid: string, sid: string | null) => (sid ? levels.get(uid)?.get(sid) ?? 0 : 0);
    const suggest: { userId: string; name: string; initials: string; line: string; streamId: string }[] = [];
    for (const r of team.roles) {
      candidates
        .map((c) => ({ c, n: lvl(c.id, r.streamId) }))
        .filter((x) => x.n >= 4)
        .sort((a, b) => b.n - a.n)
        .slice(0, 2)
        .forEach(({ c, n }) => {
          if (suggest.some((s) => s.userId === c.id)) return;
          const initials = c.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
          suggest.push({ userId: c.id, name: c.name, initials, line: t("tmd.strength", { stream: sName(r.streamId), value: formatScore(n, scale), suffix: sfx }), streamId: r.streamId });
        });
    }
    const active = streams.filter((s) => s.active);
    return {
      title: (latest ?? p.draft)!.title,
      isDraft: !latest,
      requests: team.requests.map((r) => {
        const n = lvl(r.id, r.streamId);
        const s = st(r.streamId);
        return {
          id: r.requestId, userId: r.id, name: r.name, initials: r.initials, role: r.role, roleLabel: t(`role.${r.role}`),
          time: t("tmd.asked", { when: timeAgo(r.at, i18n) }),
          stream: s ? { name: streamName(s), color: s.color } : null,
          // Nothing is said about people who keep their strengths private.
          strengthLine: s && levels.has(r.id) ? (n ? t("tmd.strength", { stream: streamName(s), value: formatScore(n, scale), suffix: sfx }) : t("tmd.noActivity", { stream: streamName(s) })) : "",
          note: r.note,
        };
      }),
      members: byLead(team.members).map((m) => {
        const isL = m.id === team.leadId;
        const parts = [isL ? t("tm.lead") : t("tm.contributor")];
        if (m.streamId) parts.push(sName(m.streamId));
        if (m.id === team.authorId) parts.push(t("tm.started"));
        else parts.push(t("tmd.joined", { date: shortDate(m.joinedAt, locale) }));
        return { id: m.id, firstName: first(m.name), name: nameOf(m), initials: m.initials, sub: parts.join(" · "), isLead: isL, isMe: m.id === user.id, offered: team.offer?.to === m.id };
      }),
      memberCount: team.cap ? t("tmd.ofCap", { n: team.members.length, cap: team.cap }) : String(team.members.length),
      people: candidates.map((c) => ({ id: c.id, label: `${c.name} · ${t(`role.${c.role}`)}` })),
      streamOpts: active.map((s) => ({ id: s.id, label: streamName(s) })),
      invites: team.invites.map((i) => ({ id: i.inviteId, name: i.name, meta: [sName(i.streamId), t("tmd.sent", { when: timeAgo(i.at, i18n) })].filter(Boolean).join(" · ") })),
      suggest,
      roles: openRoles,
      roleOpts: active.filter((s) => !team.roles.some((r) => r.streamId === s.id)).map((s) => ({ id: s.id, label: streamName(s) })),
      mode: team.joinMode,
      cap: team.cap,
      // Keep a limit set some other way selectable alongside the standard choices.
      capOptions: [...new Set([...CAP_OPTIONS, ...(team.cap ? [team.cap] : [])])].sort((x, y) => x - y),
      blocked: team.blocked.map((b) => ({ id: b.id, name: b.name })),
    };
  }

  return {
    proposalId: p.id,
    countLabel: tn("tm.count", team.members.length),
    members,
    offer,
    invite,
    openRoles,
    isLead,
    isContrib: member && !isLead,
    reqBadge: isLead ? team.requests.length : 0,
    join,
    ask,
    drawer,
  };
}

export type CrCardItem = { id: string; note: string; initials: string; isMe: boolean; meta: string; status: string; tone: string; conflicts: string };

/** The change requests card: shown to team members, open requests first. */
export async function buildChangeRequests(p: ProposalDetail, user: CurrentUser, i18n: I18n): Promise<{ items: CrCardItem[]; openCount: number } | null> {
  if (!p.role) return null;
  const { t, tn } = i18n;
  const rows = (await getChangeRequests(p.id)).sort((a, b) => Number(b.status === "open") - Number(a.status === "open"));
  if (!rows.length) return { items: [], openCount: 0 };
  const isLead = p.role === "lead";
  const ours = p.draft ?? p.versions.at(-1) ?? null;
  const items = rows.map((c) => {
    let conflicts = 0;
    if (c.status === "open" && isLead && ours) {
      const base = p.versions.find((v) => v.number === c.baseVersion);
      if (base) conflicts = mergeRequest(base, ours, c).hunks.filter((h) => h.kind === "conflict").length;
    }
    return {
      id: c.id,
      note: c.note,
      initials: c.authorInitials,
      isMe: c.authorId === user.id,
      meta: t("cr.meta", { who: c.authorId === user.id ? t("cr.you") : first(c.authorName), version: `v${c.baseVersion}`, when: timeAgo(c.updatedAt, i18n) }),
      status: c.status === "open" && isLead ? t("cr.st.needsReview") : t(`cr.st.${c.status}`),
      tone: c.status,
      conflicts: conflicts ? tn("cr.conflicts", conflicts) : "",
    };
  });
  return { items, openCount: rows.filter((r) => r.status === "open").length };
}
