# BugFlow API Documentation

Base URL (local dev): `http://localhost:4000`
Interactive Swagger UI: `GET /docs` · Raw spec: `GET /openapi.json`

All endpoints except `/health`, `/api/health`, and `POST /api/auth/login`
require a bearer token:

```
Authorization: Bearer <token from /api/auth/login>
```

---

## Health

### `GET /health`
Liveness only — no database dependency. Used by the Docker healthcheck.

```json
{ "status": "healthy", "database": "postgresql" }
```

### `GET /api/health`
Readiness — actually pings Postgres.

```json
{ "ok": true, "db": "connected" }
```
On failure: `500 { "ok": false, "error": "<message>" }`

---

## Authentication

### `POST /api/auth/login`
```json
// Request
{ "username": "admin", "password": "BugFlow@123" }
```
```json
// 200 Response
{
  "token": "eyJhbGciOi...",
  "user": { "id": "USR-ADMIN", "username": "admin", "displayName": "Admin User", "role": "Admin" }
}
```
`401` on bad credentials.

### `GET /api/auth/me`
Returns the current user for the supplied token.
```json
{ "user": { "id": "USR-ADMIN", "username": "admin", "displayName": "Admin User", "role": "Admin" } }
```

---

## Users

### `GET /api/users`
Every active account (any authenticated role can read this — used to
populate assignee pickers).
```json
[
  { "id": "USR-DEV3", "username": "john", "displayName": "John Park", "role": "Developer" }
]
```

---

## Issues

### `GET /api/issues`
**Milestone 4:** supports pagination via `?skip=&limit=` (max page size 200).

- No `skip`/`limit` supplied → back-compat bare array (unchanged behavior):
```json
[ { "id": "BUG-1001", "title": "...", "status": "Open", "...": "..." } ]
```
- Either param supplied, e.g. `GET /api/issues?skip=0&limit=50`:
```json
{
  "items": [ { "id": "BUG-1001", "...": "..." } ],
  "total": 16234,
  "skip": 0,
  "limit": 50
}
```

### `POST /api/issues`
```json
// Request
{
  "title": "Checkout fails on expired card",
  "description": "500 error thrown when a card is declined mid-checkout",
  "severity": "High",
  "priority": "P1 - High",
  "project": "Checkout & Payments",
  "module": "Payments Gateway",
  "environment": "Production",
  "category": "API Gateway",
  "reporter": "Reporter User",
  "tags": ["checkout", "payments"]
}
```
```json
// 201 Response — full Issue object, id assigned server-side (BUG-100x)
{ "id": "BUG-1042", "status": "Open", "assignee": "Unassigned", "...": "..." }
```

### `PATCH /api/issues/:id`
```json
// Request
{
  "patch": { "status": "In Progress", "assignee": "John Park" },
  "activity": { "type": "status", "text": "Started work", "actor": "John Park" }
}
```

### `DELETE /api/issues/:id`
`200 { "success": true }`

### `POST /api/issues/:id/comments`
```json
{ "author": "Alice Chen", "text": "Repro'd on staging, digging in." }
```

### `POST /api/issues/:id/tags` / `DELETE /api/issues/:id/tags/:tag`
```json
{ "tag": "regression" }
```

### `POST /api/issues/triage-recommendation` (Admin only)
Smart Priority Calculator + Smart Developer Matcher preview — doesn't
write to the database.
```json
// Request
{
  "title": "Login endpoint throws 500",
  "description": "Auth token validation fails intermittently",
  "severity": "Critical",
  "category": "Security Vulnerability"
}
```
```json
// 200 Response
{
  "priorityScore": 12,
  "priorityLabel": "URGENT",
  "priority": "P0 - Urgent",
  "recommendations": [
    { "id": "USR-DEV4", "displayName": "Maria Silva", "matchPercent": 100, "reason": "Security, Authentication match · 1 active task" }
  ]
}
```

### `POST /api/issues/:id/attachments`
`multipart/form-data`, field name `file` — `.png`, `.jpg`, or `.log`, max 8MB.

### `POST /api/issues/:id/resolution-report` / `POST /api/issues/:id/admin-response`
```json
{ "reportText": "Fixed by adding a null check before the card-decline branch." }
```
```json
{ "message": "Confirmed fixed, deployed to production." }
```

---

## Sprints

### `GET /api/sprints`
```json
[
  {
    "id": "SPRINT_abc123",
    "name": "Sprint 5",
    "status": "ACTIVE",
    "velocity": null,
    "issuesCount": 8,
    "completedCount": 3,
    "completionPct": 38
  }
]
```

### `GET /api/sprints/backlog`
Issues with `sprint_id IS NULL` and not `Closed`.

### `POST /api/sprints` (Admin, Project Manager)
```json
{ "name": "Sprint 6", "goal": "Payments hardening", "startDate": "2026-09-22", "endDate": "2026-10-03" }
```

### `PATCH /api/sprints/:id` (Admin, Project Manager)
```json
{ "status": "COMPLETED" }
```
Velocity freezes exactly once, the moment `status` transitions into
`COMPLETED` (see `shouldFreezeVelocity` in `server/src/routes/sprints.js`).

### `POST /api/sprints/:id/add-issue/:issueId` / `DELETE /api/sprints/:id/remove-issue/:issueId`
No body — moves the issue between Backlog and the named sprint.

---

## Activity

### `GET /api/activity/recent?limit=20`
Combined recent-activity feed across every issue.

---

## Notifications

### `GET /api/notifications`
### `PATCH /api/notifications/:id/read`
### `POST /api/notifications/read-all`

---

## Analytics — Milestone 4 (Admin, Project Manager only)

### `GET /api/analytics/developer-workload`
```json
{
  "developers": [
    {
      "id": "USR-DEV3",
      "developer": "John Park",
      "team": "Backend Engineering",
      "activeTasks": 4,
      "completedFixes": 12,
      "avgMttrHours": 18.6
    },
    {
      "id": "USR-DEV2",
      "developer": "Alice Chen",
      "team": "Frontend UI",
      "activeTasks": 1,
      "completedFixes": 7,
      "avgMttrHours": 9.2
    }
  ],
  "resourceBalance": {
    "maxActiveTasks": 4,
    "minActiveTasks": 1,
    "spread": 3,
    "imbalanced": true
  }
}
```
`team` is derived from the developer's `core_skills` (see `deriveTeam()` in
`server/src/analyticsHelpers.js`) — BugFlow's `users` table doesn't have a
separate team column. `avgMttrHours` is `null` until that developer has at
least one resolved issue.

### `GET /api/analytics/system-performance`
```json
{
  "kpis": {
    "bugFixRatePct": 85.0,
    "avgFixTimeDays": 2.5,
    "backlogHealthScore": 92,
    "defectLeakageRatePct": 4.2
  },
  "scale": {
    "issueCount": 1834,
    "scaleTarget": 50000,
    "targetResponseTimeMs": 300,
    "avgResponseTimeMs": 41
  },
  "database": {
    "max": 30,
    "totalCount": 6,
    "idleCount": 4,
    "waitingCount": 0,
    "compositeIndexesActive": true,
    "connectionPoolingEnabled": true
  }
}
```
- `avgResponseTimeMs` is a real rolling average of the last 200 requests
  (`server/src/perf.js`), not a hardcoded number — it starts `null` until
  the API has served at least one request.
- `defectLeakageRatePct` is a proxy metric: % of resolved/closed issues
  whose `environment` was `Production` (BugFlow has no separate "escaped to
  prod" flag to compute this more precisely).
- `backlogHealthScore` = `100 - (stale-open ÷ total-open × 100)`, where
  "stale" means still open after 7+ days.

---

## Error shape

Every error response is:
```json
{ "error": "Human-readable message" }
```
Common statuses: `400` validation, `401` missing/invalid token, `403`
role not permitted, `404` not found, `500` unexpected server error.
