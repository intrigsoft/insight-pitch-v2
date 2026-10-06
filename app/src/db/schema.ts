import {
  type AnyPgColumn,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  initials: text("initials").notNull(),
  role: text("role", { enum: ["admin", "official", "citizen"] }).notNull().default("citizen"),
  // Reading and interface language (a code from the languages table).
  language: text("language").notNull().default("en"),
  // Public profile.
  title: text("title").notNull().default(""),
  org: text("org").notNull().default(""),
  location: text("location").notNull().default(""),
  bio: text("bio").notNull().default(""),
  // Languages the person reads, shown on their profile.
  reads: jsonb("reads").$type<string[]>().notNull().default(["en"]),
  strengthsPublic: boolean("strengths_public").notNull().default(false),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export const streams = pgTable("streams", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  color: text("color").notNull(),
  active: boolean("active").notNull().default(true),
  position: integer("position").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Overlap links are symmetric; each pair is stored once with a < b.
export const streamLinks = pgTable(
  "stream_links",
  {
    a: text("a")
      .notNull()
      .references(() => streams.id, { onDelete: "cascade" }),
    b: text("b")
      .notNull()
      .references(() => streams.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.a, t.b] }), check("stream_links_order", sql`${t.a} < ${t.b}`)],
);

export const proposals = pgTable("proposals", {
  id: uuid("id").primaryKey().defaultRandom(),
  // Who started the proposal. The lead (who edits and publishes) can change hands; the author never does.
  authorId: uuid("author_id")
    .notNull()
    .references(() => users.id),
  leadId: uuid("lead_id")
    .notNull()
    .references(() => users.id),
  // Who can ask to join the team: anyone, only for an open role, or no one (invites only).
  joinMode: text("join_mode", { enum: ["open", "roles", "closed"] }).notNull().default("roles"),
  teamCap: integer("team_cap"),
  // A pending offer of the lead role to a team member, which they accept or decline.
  offerTo: uuid("offer_to").references(() => users.id, { onDelete: "set null" }),
  offerNote: text("offer_note").notNull().default(""),
  offerAt: timestamp("offer_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const proposalVersions = pgTable(
  "proposal_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    proposalId: uuid("proposal_id")
      .notNull()
      .references(() => proposals.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    body: text("body").notNull(),
    note: text("note").notNull(),
    // Language the version is written in; translations are made from it. Null until detected.
    language: text("language"),
    publishedAt: timestamp("published_at", { withTimezone: true }).notNull().defaultNow(),
    // Who published it, and the team members whose merged change requests it includes.
    byId: uuid("by_id").references(() => users.id, { onDelete: "set null" }),
    withIds: uuid("with_ids").array().notNull().default(sql`'{}'::uuid[]`),
  },
  (t) => [unique("proposal_versions_number").on(t.proposalId, t.number)],
);

// At most one unpublished draft per proposal.
export const proposalDrafts = pgTable("proposal_drafts", {
  proposalId: uuid("proposal_id")
    .primaryKey()
    .references(() => proposals.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  summary: text("summary").notNull().default(""),
  body: text("body").notNull().default(""),
  // Description of what changed since the last published version, used as the version note on publishing.
  note: text("note").notNull().default(""),
  // Whether the note was written automatically, and for which content (see contentSig), so it can be refreshed.
  noteAuto: boolean("note_auto").notNull().default(true),
  noteFor: text("note_for").notNull().default(""),
  // Whether the summary was generated from the body, and for which body (hashText), to flag it when the body changes.
  summaryAuto: boolean("summary_auto").notNull().default(false),
  summaryFor: text("summary_for").notNull().default(""),
  // Team members whose change requests were merged into this draft, credited on the version it becomes.
  contributors: uuid("contributors").array().notNull().default(sql`'{}'::uuid[]`),
  savedAt: timestamp("saved_at", { withTimezone: true }).notNull().defaultNow(),
});

// Images and attachments in proposal bodies. Bodies refer to them by id; the bytes live in object storage under `key`.
export const uploads = pgTable("uploads", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
  kind: text("kind", { enum: ["image", "file"] }).notNull(),
  name: text("name").notNull(),
  contentType: text("content_type").notNull(),
  size: integer("size").notNull(),
  key: text("key").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Scores are stored on a 1–10 base scale and converted for display by the scale setting.
export const proposalStreams = pgTable(
  "proposal_streams",
  {
    proposalId: uuid("proposal_id")
      .notNull()
      .references(() => proposals.id, { onDelete: "cascade" }),
    streamId: text("stream_id")
      .notNull()
      .references(() => streams.id),
    score: integer("score").notNull(),
    authorScore: integer("author_score"),
    jevScore: real("jev_score"),
    jevConfidence: real("jev_confidence"),
  },
  (t) => [primaryKey({ columns: [t.proposalId, t.streamId] })],
);

export const follows = pgTable(
  "follows",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    proposalId: uuid("proposal_id")
      .notNull()
      .references(() => proposals.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.userId, t.proposalId] })],
);

// People following other people: notified when they publish.
export const userFollows = pgTable(
  "user_follows",
  {
    followerId: uuid("follower_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    followeeId: uuid("followee_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.followerId, t.followeeId] })],
);

// Jev's reading of how much a person's activity shows about each stream (0–10), recalculated after they publish or comment.
export const userStrengths = pgTable(
  "user_strengths",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    streamId: text("stream_id")
      .notNull()
      .references(() => streams.id, { onDelete: "cascade" }),
    score: real("score").notNull(),
    confidence: real("confidence").notNull(),
    computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.streamId] })],
);

export const comments = pgTable(
  "comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    proposalId: uuid("proposal_id")
      .notNull()
      .references(() => proposals.id, { onDelete: "cascade" }),
    parentId: uuid("parent_id").references((): AnyPgColumn => comments.id, { onDelete: "cascade" }),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    // visible: shown to everyone. pending: held for review, only the author and moderators see it.
    // flagged: shown to others as a collapsed "Hidden" line. removed: taken down by a moderator.
    status: text("status", { enum: ["visible", "pending", "flagged", "removed"] }).notNull().default("visible"),
    flagReason: text("flag_reason"),
    flagSource: text("flag_source", { enum: ["jev", "users"] }),
    // Jev's reading of the comment: what kind of point it makes and how closely it relates to the proposal (0–100).
    kind: text("kind", { enum: ["question", "concern", "suggestion", "support", "comment", "offtopic"] }),
    language: text("language"),
    relevance: integer("relevance"),
    reviewedBy: uuid("reviewed_by").references(() => users.id),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  },
  (t) => [index("comments_proposal").on(t.proposalId)],
);

// Reader flags. Each person can flag a comment once.
export const commentFlags = pgTable(
  "comment_flags",
  {
    commentId: uuid("comment_id")
      .notNull()
      .references(() => comments.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    reason: text("reason", { enum: ["Off-topic", "Inappropriate", "Spam", "Misleading"] }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.commentId, t.userId] })],
);

// Points raised in the discussion, grouped by kind, each linked to the comments that raised it.
export const insights = pgTable(
  "insights",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    proposalId: uuid("proposal_id")
      .notNull()
      .references(() => proposals.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["concern", "suggestion", "clarification"] }).notNull(),
    text: text("text").notNull(),
    answered: boolean("answered").notNull().default(false),
    // How relevant the point is to the proposal (0–100, from Jev), and the version it was judged against.
    relevance: integer("relevance"),
    relevanceVersion: integer("relevance_version"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("insights_proposal").on(t.proposalId)],
);

export const insightSources = pgTable(
  "insight_sources",
  {
    insightId: uuid("insight_id")
      .notNull()
      .references(() => insights.id, { onDelete: "cascade" }),
    commentId: uuid("comment_id")
      .notNull()
      .references(() => comments.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.insightId, t.commentId] })],
);

export const insightVotes = pgTable(
  "insight_votes",
  {
    insightId: uuid("insight_id")
      .notNull()
      .references(() => insights.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.insightId, t.userId] })],
);

export const commentLikes = pgTable(
  "comment_likes",
  {
    commentId: uuid("comment_id")
      .notNull()
      .references(() => comments.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.commentId, t.userId] })],
);

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
});

// Languages readers can switch to. The default language (a setting) can't be disabled or removed.
export const languages = pgTable("languages", {
  code: text("code").primaryKey(),
  name: text("name").notNull(),
  native: text("native").notNull(),
  rtl: boolean("rtl").notNull().default(false),
  enabled: boolean("enabled").notNull().default(true),
  position: integer("position").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Shared translation cache: one row per source text (by hash) per target language. Reused by every reader and
// every version until the source text changes. Interface strings use the same cache for runtime-translated languages.
export const translations = pgTable(
  "translations",
  {
    lang: text("lang").notNull(),
    hash: text("hash").notNull(),
    text: text("text").notNull(),
    model: text("model").notNull(),
    // Jev's faithfulness score for this translation (0–4) and what the automatic check found, if anything.
    fidelity: real("fidelity"),
    checkNote: text("check_note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    reviewedBy: uuid("reviewed_by").references(() => users.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.lang, t.hash] })],
);

/* Teams. The lead is a member too. Only the lead edits and publishes; other members suggest changes. */

export const teamMembers = pgTable(
  "team_members",
  {
    proposalId: uuid("proposal_id")
      .notNull()
      .references(() => proposals.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // The stream they joined to help with, if any.
    streamId: text("stream_id").references(() => streams.id, { onDelete: "set null" }),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.proposalId, t.userId] }), index("team_members_user").on(t.userId)],
);

// Expertise the team is looking for, shown on the proposal.
export const teamRoles = pgTable(
  "team_roles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    proposalId: uuid("proposal_id")
      .notNull()
      .references(() => proposals.id, { onDelete: "cascade" }),
    streamId: text("stream_id")
      .notNull()
      .references(() => streams.id, { onDelete: "cascade" }),
    note: text("note").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("team_roles_stream").on(t.proposalId, t.streamId)],
);

// Requests to join (from the person) and invites (from the lead). One of each per person per proposal.
export const teamRequests = pgTable(
  "team_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    proposalId: uuid("proposal_id")
      .notNull()
      .references(() => proposals.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    streamId: text("stream_id").references(() => streams.id, { onDelete: "set null" }),
    note: text("note").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("team_requests_user").on(t.proposalId, t.userId), index("team_requests_by_user").on(t.userId)],
);

export const teamInvites = pgTable(
  "team_invites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    proposalId: uuid("proposal_id")
      .notNull()
      .references(() => proposals.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    fromId: uuid("from_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    streamId: text("stream_id").references(() => streams.id, { onDelete: "set null" }),
    note: text("note").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("team_invites_user").on(t.proposalId, t.userId)],
);

// People who can't ask to join (blocked), and when someone's last request was declined (they wait 30 days).
export const teamBlocks = pgTable(
  "team_blocks",
  {
    proposalId: uuid("proposal_id")
      .notNull()
      .references(() => proposals.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    blocked: boolean("blocked").notNull().default(false),
    declinedAt: timestamp("declined_at", { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.proposalId, t.userId] })],
);

// Changes a team member suggests, based on a published version. The lead accepts or rejects each change,
// and accepted ones go into the lead's draft.
export const changeRequests = pgTable(
  "change_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    proposalId: uuid("proposal_id")
      .notNull()
      .references(() => proposals.id, { onDelete: "cascade" }),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    baseVersion: integer("base_version").notNull(),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    body: text("body").notNull(),
    note: text("note").notNull(),
    status: text("status", { enum: ["open", "merged", "returned", "closed", "withdrawn"] }).notNull().default("open"),
    // After merging: how many of the changes were accepted, e.g. "2 of 3".
    accepted: integer("accepted"),
    total: integer("total"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("change_requests_proposal").on(t.proposalId)],
);
