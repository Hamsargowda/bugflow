# BugFlow — client/server edition

BugFlow is now a real two-tier app:

- **`server/`** — Express API backed by Postgres (issues, tags, comments, activity).
- **`client/`** — the same React UI as the original artifact (circuit-trace pipeline, role switching, duplicate detection, auto-suggest severity, drag-and-drop sprint board, analytics + CSV export), now fetching from that API instead of holding everything in memory.

Nothing about the UI or feature set changed — only where the data lives.

## 1. Set up Postgres

Create a database (adjust name/user/password to match what you'll put in `.env`):

```bash
createdb bugflow
```

## 2. Server

```bash
cd server
npm install
cp .env.example .env      # edit if your Postgres creds differ from the defaults
psql -U postgres -d bugflow -f src/schema.sql   # creates tables
npm run seed               # loads the same 16 mock issues as the original artifact
npm run dev                 # starts the API on http://localhost:4000
```

Health check: `GET http://localhost:4000/api/health` → `{ ok: true, db: "connected" }`.

## 3. Client

In a second terminal:

```bash
cd client
npm install
npm run dev                 # starts Vite on http://localhost:5173
```

Vite is configured to proxy `/api/*` to `http://localhost:4000`, so the client works out of the box against the server from step 2 — no extra config needed in dev.

Open **http://localhost:5173** — you should see the same BugFlow UI, now reading and writing through Postgres. You can confirm this by opening the same database in pgAdmin and watching rows in `issues`, `comments`, `issue_tags`, and `activity` change as you use the app.

## API summary

| Method | Path                          | Purpose                                   |
|--------|-------------------------------|--------------------------------------------|
| GET    | `/api/issues`                 | List all issues (with tags/comments/activity) |
| POST   | `/api/issues`                 | Create an issue                            |
| PATCH  | `/api/issues/:id`              | Update status/assignee/sprint membership, optionally logging an activity entry |
| DELETE | `/api/issues/:id`              | Delete an issue                            |
| POST   | `/api/issues/:id/comments`     | Add a comment                              |
| POST   | `/api/issues/:id/tags`         | Add a tag                                  |
| DELETE | `/api/issues/:id/tags/:tag`    | Remove a tag                               |

Re-run `npm run seed` any time you want to reset the data back to the original 16 mock issues (it truncates and reloads all tables).

## Notes

- Role switching, permission checks (who can edit status, drag cards, delete, view analytics/admin), duplicate-title detection, and keyword-based severity/priority suggestions are all still client-side — they're UI/UX logic, not data, so there was no reason to move them to the server.
- Issue IDs (`BUG-100x`) are now assigned by the server (max existing number + 1) instead of the client, so they stay consistent across users.
- `resolvedAt` is set server-side to "now" the first time an issue moves to Resolved/Closed, matching the original artifact's behavior.

## Milestone 2 — Workflow Automation, Collaboration & Sprint Planning

A new **"Workflow & Collaboration"** tab (visible to every role) adds:

- **Smart Priority Calculator** — `POST /api/issues/triage-recommendation` computes `Priority Score = Severity Weight × Category Urgency Weight` and maps it to URGENT/HIGH/MEDIUM/LOW. Used from the Admin-only Triage panel's "Calculate Priority Score" button.
- **Smart Developer Matcher** — same endpoint returns the top 3 recommended developers, scored by keyword-to-skill matching against the bug's title/description plus current open-issue workload.
- **Comments & File Attachments** — any authenticated user can comment (unchanged) and now also attach a `.png`, `.jpg`, or `.log` file to an issue (`POST /api/issues/:id/attachments`, downloadable via a generated link).
- **Full audit trail** — every status change now records the old and new value, shown inline in the timeline and in the Live Activity Stream.
- **Sprint Planning** — real sprint containers (name, goal, start/end date, status) via `/api/sprints`, a Backlog of unassigned issues, a "+ Add to Sprint" picker, and a velocity number that's frozen the moment a sprint is marked Completed.
- **Live Activity Stream** — a combined recent-activity feed across every issue (`GET /api/activity/recent`).
- **Generate PDF Report** — uses the browser's native print dialog (Ctrl/Cmd+P → Save as PDF) scoped to just the Workflow & Collaboration tab's content, rather than a server-rendered PDF file.

Demo developer accounts seeded with distinct skills for the matcher to have something to work with:

| Username | Name | Skills |
|---|---|---|
| developer | Dev User | JavaScript, React, Frontend |
| alice | Alice Chen | React, CSS, Frontend |
| john | John Park | Python, PostgreSQL, Backend, Database |
| maria | Maria Silva | Security, Authentication, API |
| kenji | Kenji Sato | Mobile, React, Sync |

All demo accounts (including tester/manager/admin) still use password `BugFlow@123`.

Re-run `npm run seed` in `server/` after pulling this update — it now also seeds a demo sprint and developer skills, and the schema has new tables/columns (`sprints`, `attachments`, `category`, `priority_score`, `sprint_id`, `core_skills`). **Re-run `schema.sql` first** since it drops and recreates the core tables.



BugFlow now has server-backed authentication for four roles: Developer, Tester, Project Manager, and Admin. The role is stored with the user in PostgreSQL and is not selected from the browser.

Run `npm run seed` in `server` after the auth update. It creates/updates four demo users:

- developer / BugFlow@123
- tester / BugFlow@123
- manager / BugFlow@123
- admin / BugFlow@123

Start the server with `npm run dev`, then the client with `npm run dev`. Open `http://localhost:5173` and sign in with one of the demo accounts. The server validates the token on protected API requests and enforces role permissions for issue actions.

For production, change the demo passwords and set a strong `JWT_SECRET` in `server/.env`.

## Resolution report workflow (assignee → Admin → reporter)

Resolving an issue no longer notifies the reporter automatically. Instead:

1. **Assignee resolves the issue**, then writes up what they did and submits it as a *resolution report* — from Settings ("My assignments") or straight from the issue detail view. This goes to every Admin (`POST /api/issues/:id/resolution-report`).
2. **Admin reviews the report** in Settings under "Resolution reports awaiting review" (or in the issue detail view), then writes their own short update and sends it on to the person who originally reported the issue (`POST /api/issues/:id/admin-response`).
3. **The reporter only finds out once the Admin sends that update** — it shows up as a notification and in their Settings → "My reported issues" list, under "Update from Admin".

This adds new columns to `issues` (`resolution_report`, `resolution_report_at`, `admin_response`, `admin_response_at`, `report_status`) and a new notification type (`report_submitted`) — **re-run `schema.sql` and `npm run seed`** after pulling this update.

Also fixed: the issue list is now polled every 30s (and refreshed on tab focus), same as notifications already were — previously a signed-in user's own views (like "My reported issues") only ever reflected changes made in their own session and went stale until a manual page reload.

## Milestone 4 — Optimization, 50k+ Scale Testing & Finalization

The Milestone 4 spec was written for a Python/FastAPI/SQLAlchemy/pytest stack;
BugFlow is Node/Express + `pg` (PostgreSQL) + React, so every deliverable
below is the equivalent for *this* codebase, not a literal port.

### 1. Developer Workload / Team Productivity

- `GET /api/analytics/developer-workload` (Admin, Project Manager) — for every
  active `Developer` account: their derived **Team** (from `core_skills` —
  see `deriveTeam()` in `server/src/analyticsHelpers.js`), **Active Tasks**
  (issues `In Progress` or `In Review`), **Completed Fixes** (`Resolved` or
  `Closed`), and **Avg MTTR** in hours. Also returns a `resourceBalance`
  block flagging when the busiest and quietest developer differ by 3+ active
  tasks.
- Shown in the app as the **Developer Productivity Matrix** table on the new
  **Milestone 4: Optimization & Finalization** tab (Admin/PM only).

### 2. Database Speed Optimization (50,000+ issues)

- **Composite indexes** (`server/src/schema.sql`): `(project, status)`,
  `(assignee, status)`, and `created_at DESC` — the three shapes the list
  views actually filter/sort by.
- **Connection pooling** (`server/src/db.js`): the `pg` Pool is tuned with
  `max`/`min`/`idleTimeoutMillis`/`connectionTimeoutMillis` (env-overridable
  via `PG_POOL_MAX`/`PG_POOL_MIN`) — the equivalent of SQLAlchemy's
  `pool_size`/`max_overflow`/`pool_pre_ping` for a driver that has one pool
  ceiling instead of a base+overflow split. `poolStats()` exposes live
  occupancy for the dashboard.
- **Pagination**: `GET /api/issues?skip=&limit=` (max page size 200). Calling
  it with no params keeps the original plain-array response so the existing
  UI is unaffected; passing either param switches the response to
  `{ items, total, skip, limit }`.

### 3. Automated Test Suite (`server/tests/`)

Node's equivalent of a pytest suite is Jest + Supertest:

```bash
cd server
npm install
npm test
```

- `test_auth.test.js` — JWT signing/expiry, `requireAuth` (missing/invalid/
  valid tokens), `requireRoles` access control.
- `test_issues.test.js` — Smart Priority Calculator math (`computePriorityScore`,
  `priorityLabelForScore` boundaries), the Smart Developer Matcher's ranking
  and workload-weighting, pagination clamping, and that `/api/issues` 401s
  before ever touching the database.
- `test_sprints.test.js` — sprint completion-percentage math and the
  once-only velocity-freeze rule.
- `test_analytics.test.js` — team derivation, MTTR/backlog-health/defect-
  leakage math, and the `/health` liveness check.

These tests mock nothing and need no live Postgres connection — the route
handlers that *do* need the database are covered by hitting them without a
token and asserting `requireAuth` blocks the request first, plus the
pure calculation helpers each route delegates to.

### 4. Docker & Documentation

- `server/Dockerfile` — `node:20-slim` (no `libpq-dev`/build step needed;
  `pg` is a pure-JS driver, unlike `psycopg2`).
- `client/Dockerfile` + `client/nginx.conf` — multi-stage Vite build served
  by nginx, reverse-proxying `/api`, `/docs`, `/openapi.json`, and `/health`
  to the server container.
- `docker-compose.yml` (repo root) — Postgres 15 + API + client, with:
  - `schema.sql` auto-applied via `docker-entrypoint-initdb.d` on first boot
  - the API container running `node src/seed.js && node src/index.js` (seed
    is idempotent, safe to re-run)
  - healthchecks on both `db` (`pg_isready`) and `server` (`GET /health`)
  - a named volume (`bugflow_pgdata`) so data survives container restarts

```bash
docker compose up --build
# API:    http://localhost:4000  (Swagger docs at /docs)
# Client: http://localhost:5173
```

- `GET /health` — liveness only, no DB dependency, returns
  `{ "status": "healthy", "database": "postgresql" }` (used by the Docker
  healthcheck above).
- `GET /api/health` — readiness: actually pings Postgres.
- See `API_DOCUMENTATION.md` for full endpoint/payload reference.

### Milestone 4 UI tab

**"Milestone 4: Optimization & Finalization"** (Admin/PM only, same gate as
Admin Overview) shows:

1. Four KPI boxes — Bug Fix Rate, Average Fix Time (MTTR), Backlog Health
   Score, Defect Leakage Rate.
2. A **System Scale & Performance** card — live DB pool occupancy, a real
   rolling-average response time (`server/src/perf.js`, not a hardcoded
   number) against the 300ms target, and current issue count vs. the
   50,000+ scale target.
3. A **Database Performance Checklist** — composite indexes / connection
   pooling / role-based access control, all reflecting real config rather
   than an unverifiable claim (the spec's "Zero Critical Security
   Violations" line was swapped for something this app can actually back
   up: JWT auth + bcrypt hashing + role checks).
4. The **Developer Productivity Matrix** table described above.
5. A **"Publish All Documentation & Guides"** button linking to `/docs`
   (Swagger UI) and this README.

### Student checklist — how to verify each piece

- [ ] `cd server && npm install && npm test` → all Jest suites pass.
- [ ] Sign in as `admin` or `manager`, open the **Milestone 4** tab → real
      numbers, not placeholders (empty state if there's no data yet — seed
      first).
- [ ] `psql -d bugflow -c "\d issues"` → confirm `idx_issues_project_status`,
      `idx_issues_assignee_status`, `idx_issues_created_at` exist.
- [ ] `curl http://localhost:4000/health` → `{"status":"healthy","database":"postgresql"}`.
- [ ] `docker compose up --build` → Postgres, the API, and the client all
      come up; `curl http://localhost:4000/health` succeeds without any
      manual setup step.

## Integrated Module 1–4 coverage

This final package combines the supplied milestones and retains the existing Express + PostgreSQL architecture while implementing the requested Module 1–4 feature set: RBAC, issue reporting and lifecycle workflow, duplicate/triage assistance, comments and attachments, sprint planning, Git CI/CD webhook automation, quality metrics, Plotly analytics, PDF/CSV exports, developer workload analytics, pagination, composite indexes, connection pooling, pytest/Jest coverage, Docker, Swagger/OpenAPI, health checks, and API documentation.

### Module 3 API namespace

The CI/CD and analytics endpoints are exposed under `/api/v1`:

- `POST /api/v1/webhooks/git`
- `GET /api/v1/analytics/quality-metrics`
- `GET /api/v1/analytics/defect-trends`
- `GET /api/v1/analytics/plotly-charts`
- `GET /api/v1/export/pdf`
- `GET /api/v1/export/csv`

The project remains Express-based to preserve the supplied GitHub/application architecture; the original Module 1 specification's FastAPI/SQLAlchemy wording is therefore represented as requirements rather than a backend migration.
