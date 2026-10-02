# Insight Pitch: build plan

Source design: claude.ai/design project "Insight Pitch proposal management"
(`design/Insight Pitch v2.dc.html` is the primary design, `design/Insight Pitch.dc.html` is v1 for reference).

## Stack

- Next.js 16 (App Router, TypeScript, Turbopack) in `app/`
- PostgreSQL 16 in Docker (`insight-pitch-pg`, port 54329, databases `insight_pitch` and `insight_pitch_test`)
- Drizzle ORM + drizzle-kit SQL migrations, seed script with the design's sample data
- Email/password auth with bcrypt and database sessions (httpOnly cookie)
- Stream scoring by Jev (TypeSafe System One REST API, `TYPESAFE_API_KEY`), with author scores as fallback
- Playwright e2e tests in `app/tests`, plus screenshot comparison against the design (`app/tests/visual`)

## Checklist

### Foundation
- [x] Project scaffold, fonts (Geist + Newsreader), design tokens and global CSS
- [x] Database schema, migrations, seed data matching the design (8 people, 9 streams, 8 proposals, versions, comments)
- [x] Auth: sign in, sign out, sessions, route protection (proxy), admin role
- [x] Design reference screenshots (one per screen) for visual comparison

### Screens
- [x] Login: split layout, validation errors, sign in, "Continue with national ID", forgot password, create account
- [x] App header: logo, search, New proposal, settings button (admins), avatar menu (My proposals, Admin settings, Sign out)
- [x] Proposals list: Library tabs with counts, Streams filter, search, sort (recent / discussed / score), badges, score chips, compact empty state, clear filters
- [x] Proposal view: version banner, draft notice, title/summary/meta, stream scores card (Jev caption, "Not scored"), body with ## headings, status card (edit / follow), version history with unpublished draft entry
- [x] Discussion: post comment, like/unlike, reply (Enter to send, Esc to cancel), @mention replies, collapse to latest reply with "View N earlier replies"
- [x] Editor: title/summary/body, stream chips + score sliders (by scoring mode), status card, version note rules, save draft, publish v1 / publish vN, validation errors, published versions list, toasts
- [x] Admin settings: Streams tab (table, active toggle, add/edit drawer with colour, overlaps, active, delete or in-use note, duplicate-name check)
- [x] Admin settings: Scoring tab (scale 1–5 / 0–10 / 0–100, who assigns scores, require stream, show public scores)
- [x] Admin settings: Overlaps tab (co-occurrence matrix, linked outlines, suggested overlaps with Link)
- [x] Jev scoring on publish (scores selected streams), caption and fallback when Jev is unavailable

### Quality
- [ ] Playwright e2e tests covering every screen and flow
- [ ] Visual comparison of every screen against the design
- [ ] Responsive check at phone width
- [ ] Final full walkthrough, README with setup steps, status summary below

## Decisions

## Status summary
