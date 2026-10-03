# Insight Pitch

A proposal management app for public decisions: citizens and officials draft proposals, publish them as
numbered versions, discuss them, and see each proposal scored against policy "streams" by Jev
(TypeSafe System One). Built from the Claude Design file in `design/`.

- `design/`: the Claude Design source (`Insight Pitch v2.dc.html` is the design this app follows)
- `app/`: the Next.js 16 app (App Router, TypeScript, PostgreSQL via Drizzle)
- `PLAN.md`: build checklist, decisions and status

## Run it locally

Requirements: Node 20.9+, Docker.

```bash
# 1. Database (Postgres 16 on port 54329, with a separate test database)
docker run -d --name insight-pitch-pg -e POSTGRES_USER=insight -e POSTGRES_PASSWORD=insight \
  -e POSTGRES_DB=insight_pitch -p 54329:5432 -v insight-pitch-pgdata:/var/lib/postgresql/data \
  --restart unless-stopped postgres:16-alpine
docker exec insight-pitch-pg psql -U insight -d insight_pitch -c "create database insight_pitch_test;"

# 2. App
cd app
cp .env.example .env          # add TYPESAFE_API_KEY (Jev) and OPENAI_API_KEY (insight summaries)
npm install
npm run db:reset              # apply migrations and load the design's sample data
npm run dev                   # http://localhost:3000
```

Sign in as **maya.chen@insight.gov** / **insight2026** (admin). Every seeded person uses the same
password, for example `priya.raman@insight.gov` (official) or `lena.fischer@example.org` (citizen).

## Scripts (in `app/`)

| Script | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run db:generate` | Generate a SQL migration after changing `src/db/schema.ts` |
| `npm run db:migrate` | Apply migrations |
| `npm run db:seed` | Replace all data with the design's sample data |
| `npm run db:reset` | Migrate, then seed |
| `npm run jev:rescore` | Score every published proposal's streams with Jev |
| `npm run comments:analyze` | Run Jev over comments that have no analysis yet and add them to insights |
| `npm run test:e2e` | Build the app and run all Playwright tests against the test database |
| `npm run test:visual` | Only the visual comparison against the design screenshots |
| `npm run design:refs` | Re-render the design reference screenshots from `design/` |

## How scoring works

Scores are stored on a 1–10 scale and shown as 1–5, 0–10 or 0–100 depending on the admin setting.
Authors pick the streams a proposal affects. When a proposal is published, Jev answers one score
question per selected stream (a ten-level rubric) in a single call:

- **Author** mode: the author's score is shown; Jev is not called.
- **Reviewers** mode: Jev's score is shown; authors only pick streams.
- **Author, then reviewers** (default): authors suggest a score and Jev's score replaces it on publish.

If Jev is not configured or the call fails, the proposal still publishes with the author's scores and
the score card says the review is pending. The interface never names Jev; it calls this step "review".

## How comments are checked

Every new comment goes through Jev before it posts: one call asks whether it breaks the discussion rules, how
closely it relates to the proposal, and whether it's a question, concern, suggestion, support or other remark.
Rule problems and off-topic comments get a warning the writer can act on; held comments wait in
**Admin settings → Moderation**. Questions, concerns and suggestions feed the proposal's **Insights**, where Jev
groups repeats and OpenAI (`gpt-6-luna`, set `OPENAI_MODEL` to change it) writes a one-line summary for new points.

## Staging deployment (Railway)

Pushing to the `staging` branch runs `.github/workflows/staging.yml`:

1. **Build and test**: type check, lint, and the Playwright suite against a Postgres service container. The run has
   no Jev or OpenAI keys, so specs that need them skip themselves; the visual comparison only runs locally.
2. **Deploy**: `railway up` uploads `app/` to the `app` service in the Railway project **insight-pitch**, environment
   **staging**. Railway builds it, runs `npm run db:migrate` before switching traffic, and health-checks `/login`.

Staging URL: https://app-staging-adac.up.railway.app

Setup that lives outside the repo:

- Railway service settings (build `npm run build`, pre-deploy `npm run db:migrate`, start `npm run start`, health
  check `/login`) and variables (`DATABASE_URL` → the staging Postgres, `TYPESAFE_API_KEY`, `OPENAI_API_KEY`,
  `OPENAI_MODEL`, `RAILPACK_NODE_VERSION=22`).
- GitHub repository secret `RAILWAY_TOKEN`: a Railway **project token** for the insight-pitch **staging** environment.
- Deploys never reseed. The staging database was seeded once with the sample data; to reseed, run
  `railway ssh --service app --environment staging -- npx tsx scripts/seed.mts` (this replaces all staging data).
