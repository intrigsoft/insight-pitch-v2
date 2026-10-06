-- Sample teams and change requests from the v9 design, for environments seeded before teams existed (staging).
-- Only runs where the sample people and proposals exist and no proposal has a team beyond its lead yet.
DO $$
DECLARE
  maya uuid; priya uuid; daniel uuid; lena uuid; tomas uuid; sam uuid; jun uuid; ava uuid; kai uuid;
  p1 uuid; p2 uuid; p3 uuid; p4 uuid; p5 uuid; p7 uuid; p8 uuid;
  v1body text; v3body text;
BEGIN
  SELECT id INTO maya FROM users WHERE email = 'maya.chen@insight.gov';
  SELECT id INTO priya FROM users WHERE email = 'priya.raman@insight.gov';
  SELECT id INTO daniel FROM users WHERE email = 'daniel.okafor@insight.gov';
  SELECT id INTO lena FROM users WHERE email = 'lena.fischer@example.org';
  SELECT id INTO tomas FROM users WHERE email = 'tomas.herrera@example.org';
  SELECT id INTO sam FROM users WHERE email = 'sam.whitfield@example.org';
  SELECT id INTO jun FROM users WHERE email = 'jun.park@example.org';
  SELECT id INTO ava FROM users WHERE email = 'ava.moreau@example.org';
  SELECT id INTO kai FROM users WHERE email = 'kai.moreno@example.org';
  IF maya IS NULL OR priya IS NULL OR daniel IS NULL OR lena IS NULL OR tomas IS NULL OR sam IS NULL OR jun IS NULL OR ava IS NULL OR kai IS NULL THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM team_members tm JOIN proposals p ON p.id = tm.proposal_id WHERE tm.user_id <> p.lead_id) THEN RETURN; END IF;

  SELECT p.id INTO p1 FROM proposals p JOIN proposal_versions v ON v.proposal_id = p.id WHERE v.title = 'Build a 200-bed district hospital in the northern region' AND p.lead_id = priya LIMIT 1;
  SELECT p.id INTO p2 FROM proposals p JOIN proposal_versions v ON v.proposal_id = p.id WHERE v.title = 'Publish all public procurement contracts online within 30 days' AND p.lead_id = daniel LIMIT 1;
  SELECT p.id INTO p3 FROM proposals p JOIN proposal_versions v ON v.proposal_id = p.id WHERE v.title = 'Free school meals sourced from local farms' AND p.lead_id = lena LIMIT 1;
  SELECT p.id INTO p4 FROM proposals p JOIN proposal_versions v ON v.proposal_id = p.id WHERE v.title = 'Heritage trail and visitor centre for the old town' AND p.lead_id = tomas LIMIT 1;
  SELECT p.id INTO p5 FROM proposals p JOIN proposal_versions v ON v.proposal_id = p.id WHERE v.title = 'Free legal aid clinics at every district court' AND p.lead_id = maya LIMIT 1;
  SELECT p.id INTO p7 FROM proposals p JOIN proposal_versions v ON v.proposal_id = p.id WHERE v.title = 'Electric bus pilot on two city routes' AND p.lead_id = sam LIMIT 1;
  SELECT p.id INTO p8 FROM proposals p JOIN proposal_versions v ON v.proposal_id = p.id WHERE v.title = 'Digital land registry to reduce property disputes' AND p.lead_id = jun LIMIT 1;

  IF p1 IS NOT NULL THEN
    INSERT INTO team_members (proposal_id, user_id, stream_id, joined_at) VALUES (p1, ava, 'finance', now() - interval '14 days'), (p1, maya, NULL, now() - interval '10 days') ON CONFLICT DO NOTHING;
    INSERT INTO team_roles (proposal_id, stream_id, note) VALUES (p1, 'transport', 'Plan the access road and the bus link to the regional route') ON CONFLICT DO NOTHING;
    UPDATE proposals SET offer_to = maya, offer_note = 'I move to the national planning office in November. You know the funding side best.', offer_at = now() - interval '1 day' WHERE id = p1;
    SELECT body INTO v3body FROM proposal_versions WHERE proposal_id = p1 AND number = 3;
    IF v3body LIKE '%alongside Phase 1.%' THEN
      INSERT INTO change_requests (proposal_id, author_id, base_version, title, summary, body, note, created_at, updated_at)
      SELECT p1, maya, 3, title, summary, replace(body, 'alongside Phase 1.', 'alongside Phase 1 and maintain it afterwards from its regular maintenance budget.'), 'Named who maintains the access road after construction', now() - interval '1 day', now() - interval '1 day'
      FROM proposal_versions WHERE proposal_id = p1 AND number = 3;
    END IF;
  END IF;
  IF p2 IS NOT NULL THEN
    INSERT INTO team_members (proposal_id, user_id, stream_id, joined_at) VALUES (p2, lena, 'it', now() - interval '13 days') ON CONFLICT DO NOTHING;
    UPDATE proposals SET join_mode = 'open' WHERE id = p2;
  END IF;
  IF p3 IS NOT NULL THEN UPDATE proposals SET join_mode = 'closed' WHERE id = p3; END IF;
  IF p8 IS NOT NULL THEN
    INSERT INTO team_roles (proposal_id, stream_id, note) VALUES (p8, 'law', 'Draft the dispute rules for contested titles'), (p8, 'finance', 'Estimate the three-year cost') ON CONFLICT DO NOTHING;
    INSERT INTO team_requests (proposal_id, user_id, stream_id, note, created_at) VALUES (p8, maya, 'law', 'I drafted the legal aid proposal and work with the district courts on civil cases.', now() - interval '2 days') ON CONFLICT DO NOTHING;
  END IF;
  IF p5 IS NOT NULL THEN
    INSERT INTO team_members (proposal_id, user_id, stream_id, joined_at) VALUES (p5, daniel, 'law', now() - interval '10 days'), (p5, sam, NULL, now() - interval '9 days') ON CONFLICT DO NOTHING;
    UPDATE proposals SET team_cap = 6 WHERE id = p5;
    INSERT INTO team_roles (proposal_id, stream_id, note) VALUES (p5, 'finance', 'Check the coordinator and desk costs, and find a budget line') ON CONFLICT DO NOTHING;
    INSERT INTO team_requests (proposal_id, user_id, stream_id, note, created_at) VALUES
      (p5, ava, 'finance', 'Forty years costing public buildings. Happy to check the coordinator and desk space costs line by line.', now() - interval '5 hours'),
      (p5, kai, 'finance', 'add me pls want to be on this', now() - interval '1 hour') ON CONFLICT DO NOTHING;
    INSERT INTO team_invites (proposal_id, user_id, from_id, stream_id, note, created_at) VALUES (p5, jun, maya, 'it', 'Could you advise on a simple case log the desks could share?', now() - interval '1 day') ON CONFLICT DO NOTHING;
    -- Maya's draft staffs the desks three days a week, which overlaps with Sam's change below.
    UPDATE proposal_drafts SET body = replace(body, 'staffed two days a week by volunteer lawyers and supervised law students.', 'staffed three days a week by volunteer lawyers and supervised law students, with one full-time coordinator for the programme.') WHERE proposal_id = p5;
    SELECT body INTO v1body FROM proposal_versions WHERE proposal_id = p5 AND number = 1;
    IF v1body LIKE '%don''t know that free help exists.%' THEN
      INSERT INTO change_requests (proposal_id, author_id, base_version, title, summary, body, note, created_at, updated_at)
      SELECT p5, daniel, 1, title, summary, replace(body, 'Many cannot afford a lawyer and don''t know that free help exists.', E'Many cannot afford a lawyer, and most don''t know that free help exists.\n\nMost of these cases are family, tenancy and debt disputes, where the other side often has a lawyer. The desks would advise on all three.'), 'Named the case types the desks would cover', now() - interval '2 days', now() - interval '2 days'
      FROM proposal_versions WHERE proposal_id = p5 AND number = 1;
    END IF;
    IF v1body LIKE '%staffed two days a week by volunteer lawyers and supervised law students.%' THEN
      INSERT INTO change_requests (proposal_id, author_id, base_version, title, summary, body, note, created_at, updated_at)
      SELECT p5, sam, 1, title, summary, replace(body, 'staffed two days a week by volunteer lawyers and supervised law students.', 'staffed two days a week by volunteer lawyers and final-year law students supervised by a practising lawyer.'), 'Law students to be supervised by a practising lawyer', now() - interval '20 hours', now() - interval '20 hours'
      FROM proposal_versions WHERE proposal_id = p5 AND number = 1;
    END IF;
  END IF;
  IF p4 IS NOT NULL THEN
    INSERT INTO team_roles (proposal_id, stream_id, note) VALUES (p4, 'transport', 'Plan coach parking and the shuttle') ON CONFLICT DO NOTHING;
    INSERT INTO team_blocks (proposal_id, user_id, declined_at) VALUES (p4, maya, now() - interval '12 days') ON CONFLICT DO NOTHING;
  END IF;
  IF p7 IS NOT NULL THEN
    INSERT INTO team_roles (proposal_id, stream_id, note) VALUES (p7, 'finance', 'Review the lease terms and the savings estimate') ON CONFLICT DO NOTHING;
    INSERT INTO team_invites (proposal_id, user_id, from_id, stream_id, note, created_at) VALUES (p7, maya, sam, 'finance', 'Could you look at the lease and procurement terms before v2?', now() - interval '3 hours') ON CONFLICT DO NOTHING;
  END IF;
END $$;
