CREATE TABLE "uploads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"content_type" text NOT NULL,
	"size" integer NOT NULL,
	"key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "proposal_drafts" ADD COLUMN "note" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "proposal_drafts" ADD COLUMN "note_auto" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "proposal_drafts" ADD COLUMN "note_for" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Sample proposals: rich content and bundled media from design v7 (only where the sample text is untouched).
INSERT INTO "uploads" ("id","kind","name","content_type","size","key") VALUES ('5eed0000-0000-4000-8000-000000000001','image','proposed-site.jpg','image/jpeg',32879,'bundled/proposed-site.jpg'),('5eed0000-0000-4000-8000-000000000002','file','Cost estimate breakdown.xlsx','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',5961,'bundled/cost-estimate-breakdown.xlsx'),('5eed0000-0000-4000-8000-000000000003','file','Site survey report.pdf','application/pdf',41426,'bundled/site-survey-report.pdf'),('5eed0000-0000-4000-8000-000000000004','file','Bar association letter of support.pdf','application/pdf',25133,'bundled/bar-association-letter.pdf') ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
UPDATE "proposal_versions" SET "body"='## The problem

About 340,000 people in the northern region live more than 70 km from a full-service hospital. Emergency patients travel an average of **95 minutes**, and the two existing clinics refer most cases out of the district ([regional referral data, 2025](https://health.example.gov/referrals-2025)).

## Proposal

Build a 200-bed district hospital with emergency, maternity, surgery and outpatient departments on the public land next to the regional health office.' WHERE "number"=1 AND "title"='Build a 200-bed district hospital in the northern region' AND "note"='Initial version' AND "body" NOT LIKE '%::%' AND "body" NOT LIKE '%**%';
--> statement-breakpoint
UPDATE "proposal_versions" SET "body"='## The problem

About 340,000 people in the northern region live more than 70 km from a full-service hospital. Emergency patients travel an average of **95 minutes**, and the two existing clinics refer most cases out of the district ([regional referral data, 2025](https://health.example.gov/referrals-2025)).

## Proposal

Build a 200-bed district hospital with emergency, maternity, surgery and outpatient departments on the public land next to the regional health office.

## Cost and funding

The estimated capital cost is 48 million. Annual running costs are estimated at 9 million.

| Source | Share | Amount |
| National health infrastructure fund | 60% | 28.8 million |
| Provincial budget | 25% | 12 million |
| Development bank loan | 15% | 7.2 million |

::file 5eed0000-0000-4000-8000-000000000002 | Cost estimate breakdown.xlsx | 6 KB' WHERE "number"=2 AND "title"='Build a 200-bed district hospital in the northern region' AND "note"='Added cost and funding sources' AND "body" NOT LIKE '%::%' AND "body" NOT LIKE '%**%';
--> statement-breakpoint
UPDATE "proposal_versions" SET "body"='## The problem

About 340,000 people in the northern region live more than 70 km from a full-service hospital. Emergency patients travel an average of **95 minutes**, and the two existing clinics refer most cases out of the district ([regional referral data, 2025](https://health.example.gov/referrals-2025)).

## Proposal

Build a 200-bed district hospital on the public land next to the regional health office, in two phases:

1. **Phase 1**, within 18 months: outpatient, maternity and emergency care.
2. **Phase 2**: surgery and inpatient wards.

::image 5eed0000-0000-4000-8000-000000000001 | The proposed site, looking north from the regional health office | Level open land beside a two-storey office building, bordered by the regional road on the east side | 32 KB

## Cost and funding

The estimated capital cost is 48 million. Annual running costs are estimated at 9 million.

| Source | Share | Amount |
| National health infrastructure fund | 60% | 28.8 million |
| Provincial budget | 25% | 12 million |
| Development bank loan | 15% | 7.2 million |

::file 5eed0000-0000-4000-8000-000000000002 | Cost estimate breakdown.xlsx | 6 KB

## Access

The site needs a 3 km upgraded access road and a bus stop on the regional route. The provincial roads authority would deliver the road alongside Phase 1.

::video https://www.youtube.com/watch?v=northern-site | Walk-through of the proposed site and access route | 3:12

::file 5eed0000-0000-4000-8000-000000000003 | Site survey report.pdf | 40 KB' WHERE "number"=3 AND "title"='Build a 200-bed district hospital in the northern region' AND "note"='Split construction into two phases; added access road plan' AND "body" NOT LIKE '%::%' AND "body" NOT LIKE '%**%';
--> statement-breakpoint
UPDATE "proposal_drafts" SET "body"='## The problem

More than half of people appearing in district courts for civil matters have no legal representation. Many cannot afford a lawyer and don''t know that free help exists.

## Proposal

Open a free legal aid desk in every district court, staffed two days a week by volunteer lawyers and supervised law students.

## Funding

The bar association has offered volunteer hours. The remaining cost, mainly coordination staff and desk space, is about **600,000 a year**.

| Item | Per year |
| Coordinator (1 full-time) | 380,000 |
| Desk space and equipment | 140,000 |
| Training for law students | 80,000 |

## Measuring success

- Share of civil cases with some form of legal advice
- Number of cases resolved before a full hearing

::file 5eed0000-0000-4000-8000-000000000004 | Bar association letter of support.pdf | 25 KB' WHERE "title"='Free legal aid clinics at every district court' AND "body" NOT LIKE '%::%' AND "body" NOT LIKE '%**%';
