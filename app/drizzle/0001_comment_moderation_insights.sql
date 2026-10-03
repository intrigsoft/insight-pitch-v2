CREATE TABLE "comment_flags" (
	"comment_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "comment_flags_comment_id_user_id_pk" PRIMARY KEY("comment_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "insight_sources" (
	"insight_id" uuid NOT NULL,
	"comment_id" uuid NOT NULL,
	CONSTRAINT "insight_sources_insight_id_comment_id_pk" PRIMARY KEY("insight_id","comment_id")
);
--> statement-breakpoint
CREATE TABLE "insight_votes" (
	"insight_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	CONSTRAINT "insight_votes_insight_id_user_id_pk" PRIMARY KEY("insight_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "insights" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"proposal_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"text" text NOT NULL,
	"answered" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN "status" text DEFAULT 'visible' NOT NULL;--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN "flag_reason" text;--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN "flag_source" text;--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN "kind" text;--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN "relevance" integer;--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN "reviewed_by" uuid;--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "comment_flags" ADD CONSTRAINT "comment_flags_comment_id_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_flags" ADD CONSTRAINT "comment_flags_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insight_sources" ADD CONSTRAINT "insight_sources_insight_id_insights_id_fk" FOREIGN KEY ("insight_id") REFERENCES "public"."insights"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insight_sources" ADD CONSTRAINT "insight_sources_comment_id_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insight_votes" ADD CONSTRAINT "insight_votes_insight_id_insights_id_fk" FOREIGN KEY ("insight_id") REFERENCES "public"."insights"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insight_votes" ADD CONSTRAINT "insight_votes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insights" ADD CONSTRAINT "insights_proposal_id_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."proposals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "insights_proposal" ON "insights" USING btree ("proposal_id");--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;