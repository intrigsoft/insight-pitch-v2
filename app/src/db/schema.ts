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
  authorId: uuid("author_id")
    .notNull()
    .references(() => users.id),
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
  savedAt: timestamp("saved_at", { withTimezone: true }).notNull().defaultNow(),
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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    reviewedBy: uuid("reviewed_by").references(() => users.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.lang, t.hash] })],
);
