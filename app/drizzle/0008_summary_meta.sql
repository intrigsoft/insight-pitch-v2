ALTER TABLE "proposal_drafts" ADD COLUMN "summary_auto" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "proposal_drafts" ADD COLUMN "summary_for" text DEFAULT '' NOT NULL;