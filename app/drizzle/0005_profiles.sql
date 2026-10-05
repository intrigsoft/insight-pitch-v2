CREATE TABLE "user_follows" (
	"follower_id" uuid NOT NULL,
	"followee_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_follows_follower_id_followee_id_pk" PRIMARY KEY("follower_id","followee_id")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "title" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "org" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "location" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "bio" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "reads" jsonb DEFAULT '["en"]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "strengths_public" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user_follows" ADD CONSTRAINT "user_follows_follower_id_users_id_fk" FOREIGN KEY ("follower_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_follows" ADD CONSTRAINT "user_follows_followee_id_users_id_fk" FOREIGN KEY ("followee_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

-- Profiles for the sample people, in databases seeded before profiles existed.
UPDATE "users" SET "role" = 'citizen', "title" = '', "org" = '', "location" = 'Western district', "bio" = '', "reads" = '["en"]'::jsonb, "strengths_public" = false, "created_at" = '2026-08-01' WHERE "email" = 'kai.moreno@example.org' AND "bio" = '' AND "title" = '';--> statement-breakpoint
UPDATE "users" SET "role" = 'citizen', "title" = '', "org" = '', "location" = 'Central district', "bio" = '', "reads" = '["en"]'::jsonb, "strengths_public" = false, "created_at" = '2026-09-01' WHERE "email" = 'rob.kessler@example.org' AND "bio" = '' AND "title" = '';--> statement-breakpoint
UPDATE "users" SET "role" = 'admin', "title" = 'Policy advisor', "org" = 'Ministry of Public Administration', "location" = 'Capital district', "bio" = 'I run the Insight Pitch programme and draft proposals on access to justice and rural health.', "reads" = '["en", "si"]'::jsonb, "strengths_public" = false, "created_at" = '2025-01-01' WHERE "email" = 'maya.chen@insight.gov' AND "bio" = '' AND "title" = '';--> statement-breakpoint
UPDATE "users" SET "role" = 'official', "title" = 'Health infrastructure planner', "org" = 'Regional Health Office', "location" = 'Northern region', "bio" = 'I plan hospital and clinic capacity for the northern region. Most of my proposals start from referral and travel-time data.', "reads" = '["en", "si"]'::jsonb, "strengths_public" = true, "created_at" = '2025-03-01' WHERE "email" = 'priya.raman@insight.gov' AND "bio" = '' AND "title" = '';--> statement-breakpoint
UPDATE "users" SET "role" = 'citizen', "title" = 'Volunteer', "org" = 'Open Contracting Network', "location" = 'Capital district', "bio" = 'Procurement transparency volunteer. I read contracts so others don’t have to.', "reads" = '["en", "fr"]'::jsonb, "strengths_public" = true, "created_at" = '2025-04-01' WHERE "email" = 'daniel.okafor@insight.gov' AND "bio" = '' AND "title" = '';--> statement-breakpoint
UPDATE "users" SET "role" = 'citizen', "title" = 'School board member', "org" = '', "location" = 'Eastern district', "bio" = 'Parent of two and member of the district school board.', "reads" = '["en", "es"]'::jsonb, "strengths_public" = false, "created_at" = '2025-05-01' WHERE "email" = 'lena.fischer@example.org' AND "bio" = '' AND "title" = '';--> statement-breakpoint
UPDATE "users" SET "role" = 'official', "title" = 'Heritage officer', "org" = 'Old Town Municipal Council', "location" = 'Old Town', "bio" = 'I look after the old town’s listed buildings and work with traders on visitor plans.', "reads" = '["en", "es", "pt"]'::jsonb, "strengths_public" = true, "created_at" = '2025-02-01' WHERE "email" = 'tomas.herrera@example.org' AND "bio" = '' AND "title" = '';--> statement-breakpoint
UPDATE "users" SET "role" = 'citizen', "title" = 'Transport engineer', "org" = '', "location" = 'Capital district', "bio" = 'Civil engineer working on public transit. Interested in anything that moves people more reliably.', "reads" = '["en"]'::jsonb, "strengths_public" = true, "created_at" = '2025-06-01' WHERE "email" = 'sam.whitfield@example.org' AND "bio" = '' AND "title" = '';--> statement-breakpoint
UPDATE "users" SET "role" = 'official', "title" = 'Records modernisation lead', "org" = 'Land Registry Department', "location" = 'Capital district', "bio" = 'Leading the move from paper land titles to digital records.', "reads" = '["en"]'::jsonb, "strengths_public" = true, "created_at" = '2025-03-01' WHERE "email" = 'jun.park@example.org' AND "bio" = '' AND "title" = '';--> statement-breakpoint
UPDATE "users" SET "role" = 'citizen', "title" = 'Retired quantity surveyor', "org" = '', "location" = 'Southern district', "bio" = 'Forty years of costing public buildings. I check whether the numbers add up.', "reads" = '["en", "fr"]'::jsonb, "strengths_public" = false, "created_at" = '2025-07-01' WHERE "email" = 'ava.moreau@example.org' AND "bio" = '' AND "title" = '';
