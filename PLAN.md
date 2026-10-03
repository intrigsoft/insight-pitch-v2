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
- [x] Playwright e2e tests covering every screen and flow
- [x] Visual comparison of every screen against the design
- [x] Responsive check at phone width
- [x] Final full walkthrough, README with setup steps, status summary below

## Decisions

- **Jev is the reviewer.** The design captions scores "Extracted from the proposal by Jev". Publishing sends the
  proposal to Jev with one ten-level score question per selected stream; Jev's score replaces the author's
  suggestion (default "Author, then reviewers" mode). In "Author" mode Jev isn't called. If Jev is unavailable the
  proposal still publishes with author scores and the caption says "review pending".
- **Seed scores are the author's.** The design's sample scores are seeded as author scores, so the seeded
  proposals read "Suggested by the author · review pending" until rescored. Run `npm run jev:rescore` to have Jev score
  them (its numbers land close to the design's, e.g. Healthcare 10 vs 9 for the hospital).
- **Admin score adjusting is left out.** v2's logic has an "adjust scores" state but no button in the template,
  so it isn't reachable in the design; it isn't built.
- **Jev isn't named in the interface.** It does the reviewing behind the scenes; users see "Extracted from the
  proposal", "Reviewers confirm after publishing" and similar neutral wording (changed 3 Oct at your request).
- **Forgot password and national ID** aren't connected to a backend; both show a short explanation instead of
  failing silently. "Create an account" is a real sign-up (citizen role).
- **Discussion order.** Threads read oldest first, as in the design's sample. (The design's prototype puts new
  comments at the top; here they join the end, which keeps the thread chronological.)
- **"Recently updated" sorts by the real update time.** The design's sample order uses a hidden ranking, so the
  telemedicine draft ("updated 4 days ago") sits third here instead of last.
- **Phone layouts deviate on purpose.** At 390px the design's header overflows the screen and the settings table
  overlaps itself. The app keeps the design's look but fits the screen: compact header, smaller titles, and a
  horizontally scrollable streams table. Desktop screens match the design within 1–4% of pixels.
- **Settings are admin-only** (gear button, menu item, page and server actions). Other users get an
  "Admins only" page.

## Status summary

_Written 3 Oct 2026 at the end of the overnight build._

**Done.** Every screen and interaction in the v2 design is built on Next.js 16 with PostgreSQL: sign-in and
sign-up, the proposals list (tabs, stream filters, search, sort), the proposal page (versions, scores, follow),
threaded discussion (comments, replies, likes, mentions), the editor (drafts, versioned publishing with notes),
and admin settings (streams with the edit drawer, scoring rules, overlap matrix with suggested links).
Publishing scores the proposal's streams with Jev through the TypeSafe API; this was checked live
(an example run: Transport 9.8 → 10, Environment 3.6 → 4).

**Tests.** 39 Playwright tests pass from a clean build (`npm run test:e2e`, about 2 minutes): 29 behaviour tests
across auth, list, proposal, discussion, editor and settings, plus 10 visual checks against screenshots rendered
from the design. Desktop screens differ from the design by 1.1–3.8% of pixels (live dates and font rendering);
phone screens by 1.5–9.2%, mostly from the deliberate layout fixes listed under Decisions. No screen scrolls
sideways at 390px.

**To try it:** see the README. Sign in as `maya.chen@insight.gov` / `insight2026`. The local database
(`insight-pitch-pg` container) already holds the sample data; `npm run jev:rescore` swaps the seeded author
scores for Jev's.

**Open points for you:**
- Whether seeded proposals should show Jev scores by default (run the rescore during seeding) or keep the
  design's numbers as author scores, as now.
- Forgot password and national ID sign-in need real providers if they're wanted.
- Nobody is notified about new versions yet; "Follow" records the follow and drives the Following tab only.
