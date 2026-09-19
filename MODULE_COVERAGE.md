# BugFlow Module 1–4 Coverage

This package is the local merged build. The supplied Module 1–4 requirements are preserved verbatim in `MODULE_REQUIREMENTS_SOURCE.md`.

## Included

### Module 1 — Issue Reporting & Foundation
- Issue creation, PostgreSQL persistence, filtering/search, pagination
- Authentication with JWT and bcryptjs
- Role-based permissions including Developer, Tester, Admin, Project Manager, User, plus Triager and Stakeholder compatibility roles
- Issue triage and automatic priority scoring
- Smart developer matching based on skills and workload
- Duplicate-title detection endpoint with 55% Jaccard threshold
- Lifecycle status values including QA Verification and server-side transition validation
- Audit/activity history
- Comments and attachments
- Swagger/OpenAPI and health endpoints

### Module 2 — Workflow & Collaboration
- Priority calculator
- Developer recommendations
- Comments and `.png`/`.jpg`/`.log` attachments
- Sprint creation, backlog, assignment and velocity
- Notifications and resolution-report/admin-response workflow

### Module 3 — Analytics & APIs
- Git commit webhook: `/api/v1/webhooks/git`
- Fix rate, MTTR, defect leakage and backlog health metrics
- 14-day defect trends
- Plotly chart configuration endpoint
- Interactive DevOps dashboard
- Live API explorer
- PDF and CSV exports

### Module 4 — Optimization & Finalization
- Developer workload matrix and resource-balance indicator
- PostgreSQL composite indexes
- Connection pooling and pagination
- Automated Jest tests
- Dockerfile and Docker Compose
- README and API documentation
- `/health`, `/docs`, `/redoc`/OpenAPI-compatible documentation surface
- Milestone 4 optimization dashboard

## Architecture note

The source GitHub repository uses an Express + PostgreSQL client/server architecture. The merge preserves that architecture instead of converting the project to FastAPI/SQLAlchemy. Module requirements are implemented as compatible application behavior and API features where practical.
