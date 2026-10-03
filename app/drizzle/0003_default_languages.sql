-- Default languages for existing databases: English (default) plus Sinhala and Tamil. Skipped where languages exist.
INSERT INTO "languages" ("code", "name", "native", "rtl", "enabled", "position")
SELECT * FROM (VALUES
  ('en', 'English', 'English', false, true, 0),
  ('si', 'Sinhala', 'සිංහල', false, true, 1),
  ('ta', 'Tamil', 'தமிழ்', false, true, 2)
) AS v("code", "name", "native", "rtl", "enabled", "position")
WHERE NOT EXISTS (SELECT 1 FROM "languages");
--> statement-breakpoint
-- Content written before languages were recorded: Sinhala or Tamil if written in that script, otherwise English.
UPDATE "proposal_versions" SET "language" = CASE
  WHEN "title" || "body" ~ '[඀-෿]' THEN 'si'
  WHEN "title" || "body" ~ '[஀-௿]' THEN 'ta'
  ELSE 'en' END
WHERE "language" IS NULL;
--> statement-breakpoint
UPDATE "comments" SET "language" = CASE
  WHEN "body" ~ '[඀-෿]' THEN 'si'
  WHEN "body" ~ '[஀-௿]' THEN 'ta'
  ELSE 'en' END
WHERE "language" IS NULL;
