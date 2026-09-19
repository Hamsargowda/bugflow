module-1
# Developer Task: Build Module 1 – Issue Reporting & Foundation Management (BugFlow Platform)
 
You are an expert full-stack engineer tasked with implementing **Module 1: Issue Reporting & Foundation Management** for the **BugFlow – Software Issue Tracking & Resolution Platform**.
 
---
 
## 1. Objective & Scope

Develop an enterprise-grade issue tracking foundation enabling developers, testers, and project managers to submit, triage, assign, and track software defects and feature requests with strict role-based access control (RBAC), duplicate detection, PostgreSQL persistence, and validated lifecycle workflows.
 
---
 
## 2. Technology Stack Requirements

- **Backend**: Python 3.10+ with FastAPI (Async ASGI, OpenAPI Swagger at `/docs`)

- **Database & ORM**: PostgreSQL 15+ managed via SQLAlchemy 2.0 with connection pooling (`pool_size=20`, `pool_pre_ping=True`)

- **Authentication**: Stateless JWT tokens (HMAC-SHA256) with bcrypt password hashing

- **Validation**: Pydantic v2 schemas (`from_attributes=True`)

- **Frontend Dashboard**: Responsive HTML5, Tailwind/CSS, and JavaScript single-page UI matching Milestone 1 wireframes
 
---
 
## 3. Detailed Functional Requirements
 
### 3.1 Role-Based Access Control (RBAC)

Implement 5 user roles with granular permission levels:

- `ADMIN`: Full system administration, project creation, user role management, issue deletion.

- `DEVELOPER`: Claim assigned issues, transition lifecycle states, post comments.

- `TESTER`: Report new bugs, verify bug fixes, transition issues to `QA_VERIFICATION` / `CLOSED`.

- `TRIAGER`: Categorize issues, calculate priority scores, assign developers.

- `STAKEHOLDER`: Read-only access to dashboards and export reports.
 
### 3.2 Issue Capture & Ingestion

The issue reporting module must accept the following metadata via both Web UI and REST API (`POST /api/v1/issues/`):

- **Core Info**: `title`, `description`, `reproduction_steps`

- **Severity**: Enum (`CRITICAL`, `MAJOR`, `MINOR`, `TRIVIAL`)

- **Priority**: Enum (`URGENT`, `HIGH`, `MEDIUM`, `LOW`)

- **Category & Classification**: Foreign key to `BugCategory` (`Backend Logic`, `UI Glitch`, `Database Error`, `Security Vulnerability`, `API Gateway`)

- **Target Context**: `affected_modules` (e.g. `Auth`, `Billing`), `environment_details` (e.g. `Chrome 122, Linux Ubuntu 22.04`), `estimated_effort`

- **Associations**: `project_id`, `reporter_id`, `assignee_id` (optional), `sprint_id` (optional)
 
### 3.3 Validated Workflow State Machine

Enforce the following lifecycle state transitions:

`REPORTED` ➔ `TRIAGED` ➔ `IN_PROGRESS` ➔ `CODE_REVIEW` ➔ `QA_VERIFICATION` ➔ `RESOLVED` ➔ `CLOSED`

- Automatically timestamp `resolved_at` upon entering `RESOLVED` / `CLOSED`.

- Disallow invalid transitions (e.g., cannot transition directly from `REPORTED` to `RESOLVED` without developer assignment).

- Support reopening tickets back to `IN_PROGRESS`.
 
### 3.4 Duplicate Issue Detection

- Implement an automated text-similarity check using Jaccard token overlap / Levenshtein distance on incoming issue titles against active project issues.

- Warn the user in real-time if a potential duplicate exists with a similarity score $\ge 55\%$.
 
### 3.5 Immutable Audit Trail

- Log every state change, developer assignment, and priority update into an `AuditLog` table capturing:

  `issue_id`, `user_id`, `action`, `field_name`, `old_value`, `new_value`, `timestamp`.
 
---
 
## 4. PostgreSQL Relational Database Schema

Design and create the following tables:

1. `users`: `id`, `username`, `email`, `hashed_password`, `full_name`, `role`, `team`, `core_skills`, `proficiency`, `is_active`, `created_at`

2. `projects`: `project_id`, `project_name`, `codebase`, `development_cycle`, `created_at`

3. `bug_categories`: `category_id`, `category_name`, `urgency`

4. `issues`: `id`, `project_id`, `reporter_id`, `assignee_id`, `category_id`, `sprint_id`, `title`, `description`, `reproduction_steps`, `severity`, `priority`, `status`, `dev_stage`, `affected_modules`, `environment_details`, `estimated_effort`, `priority_score`, `created_at`, `updated_at`, `resolved_at`

5. `audit_logs`: `id`, `issue_id`, `user_id`, `action`, `field_name`, `old_value`, `new_value`, `timestamp`
 
---
 
## 5. REST API Endpoints Specification
 
| Method | Endpoint | Description | Auth Required |

| :--- | :--- | :--- | :--- |

| `POST` | `/api/v1/auth/register` | Register a new user | No |

| `POST` | `/api/v1/auth/login` | Login and receive Bearer JWT token | No |

| `GET` | `/api/v1/auth/me` | Get current user profile and role | Bearer Token |

| `POST` | `/api/v1/projects/` | Create a new project container | `ADMIN`, `TRIAGER` |

| `GET` | `/api/v1/projects/` | List all projects | Authenticated |

| `POST` | `/api/v1/issues/` | Submit a new issue / bug report | Authenticated |

| `GET` | `/api/v1/issues/` | List issues (with filters: project, status, severity, assignee, search) | Authenticated |

| `GET` | `/api/v1/issues/{id}` | Get detailed issue profile with audit history | Authenticated |

| `PATCH`| `/api/v1/issues/{id}/status` | Transition issue lifecycle state | `DEVELOPER`, `TESTER`, `ADMIN` |

| `PATCH`| `/api/v1/issues/{id}/assign` | Assign/reassign issue to a developer | `TRIAGER`, `ADMIN`, `DEVELOPER` |

| `POST` | `/api/v1/issues/check-duplicates`| Check for duplicate issues | Authenticated |
 
---
 
## 6. Frontend Wireframe & UI Requirements (Milestone 1 View)

Create a responsive web interface featuring:

1. **Top Header**: Brand logo (`BugFlow`), Role-based authentication indicator (e.g. `Auth: Role-based configured for Admin`), user profile switcher, and link to `/docs`.

2. **Issue Creation Card**: Form with Project dropdown, Title input (with real-time duplicate warning), Description textarea, Severity, Category, Affected Module, and Assignee selector.

3. **Basic Dashboard Card**: Live list of active issues formatted as `ID: B-001 | Title | Status | Severity Badge | Assignee` with real-time text search and filter.

4. **Issue Detail Modal**: Clicking an issue opens full description, reproduction steps, and state transition controls.
 
---
 
## 7. Deliverables & Acceptance Criteria

- [ ] Database schema deployed on PostgreSQL with composite indexes on `(project_id, status)` and `(created_at)`.

- [ ] JWT authentication verified with zero critical security violations.

- [ ] Issue lifecycle state transitions achieve $\ge 99\%$ consistency.

- [ ] Duplicate detection correctly flags similar defect titles.

- [ ] Automated pytest test suite covering authentication, issue CRUD, and state transitions passes with 100% success.

- [ ] Interactive OpenAPI Swagger documentation available at `/docs`.




module-2
---
 
### Part 1: Smart Priority Calculator 🧮

When someone submits a bug, calculate an automatic **Priority Score** using this simple formula:
 
$$\text{Priority Score} = \text{Severity Weight} \times \text{Category Urgency Weight}$$
 
#### The Rules:

- **Severity Weights**:

  - `CRITICAL` = 4 points

  - `MAJOR` = 3 points

  - `MINOR` = 2 points

  - `TRIVIAL` = 1 point

- **Category Urgency Weights**:

  - `High Urgency` (e.g. Security, Database) = 3 points

  - `Medium Urgency` (e.g. API, Backend) = 2 points

  - `Low Urgency` (e.g. UI Colors, Typos) = 1 point
 
#### Final Priority Result:

- Score $\ge 10$ $\rightarrow$ **`URGENT`** (Drop everything and fix now!)

- Score between $7 - 9$ $\rightarrow$ **`HIGH`**

- Score between $4 - 6$ $\rightarrow$ **`MEDIUM`**

- Score $< 4$ $\rightarrow$ **`LOW`**
 
---
 
### Part 2: Smart Developer Matcher 🧑‍💻

Write a helper function that recommends which developer should fix the bug:

1. **Look at the Bug Text**: Search words in the title/description (e.g., if it mentions *"database"*, *"sql"*, or *"login"*).

2. **Look at Developer Profiles**: Check what skills each developer has (e.g., Alice knows *React/CSS*, John knows *Python/PostgreSQL*).

3. **Check Workload**: How many open bugs does that developer already have? (Don't give 10 bugs to one person if someone else is free!).

4. **Output**: Return the top 3 recommended developers with a match percentage (e.g., *"John Doe - 92% match (PostgreSQL expert, 1 active task)"*).
 
---
 
### Part 3: Comments & File Attachments 💬📎

Enable team members to talk directly inside each bug ticket:

- **Discussion Thread**: Any logged-in user can type a comment (e.g., *"I reproduced this bug on Chrome v120"*).

- **Screenshot / Log Uploader**: Allow users to attach `.png`, `.jpg`, or `.log` files to the bug.

- **Activity Log**: Whenever someone changes the bug status (e.g., from `REPORTED` to `IN_PROGRESS`), automatically save an entry in the `AuditLog` table showing **Who**, **What changed**, and **When**.
 
---
 
### Part 4: Agile Sprint Planning & Backlog 🏃‍♂️

In Agile software development, teams work in **2-week cycles called Sprints**:

- **Sprint Container**: Fields for `Sprint Name` (e.g., *"Sprint 1 - Foundation"*), `Goal`, `Start Date`, `End Date`, and `Status` (`PLANNING`, `ACTIVE`, `COMPLETED`).

- **Product Backlog**: A list of all unassigned bugs waiting for future work.

- **Assign to Sprint**: A button to move a bug from the Backlog into an active Sprint.

- **Velocity Tracker**: When a Sprint is marked `COMPLETED`, calculate the velocity (how many bugs the team successfully resolved).
 
---
 
## 📡 API Endpoints to Create
 
Create these simple REST API routes in FastAPI / Python:
 
| Route | Method | What it does (in plain English) |

| :--- | :--- | :--- |

| `/api/v1/issues/triage-recommendation` | `POST` | Sends bug title/description $\rightarrow$ Returns priority score & recommended developers |

| `/api/v1/collaboration/issues/{id}/comments` | `POST` | Posts a new message/comment on a bug ticket |

| `/api/v1/collaboration/issues/{id}/comments` | `GET` | Fetches the full chat history for a bug ticket |

| `/api/v1/collaboration/issues/{id}/attachments` | `POST` | Uploads a screenshot/error log file for a bug |

| `/api/v1/sprints/` | `POST` | Creates a new Sprint |

| `/api/v1/sprints/` | `GET` | Lists all active and past Sprints |

| `/api/v1/sprints/{id}/add-issue/{issue_id}` | `POST` | Moves a bug from backlog into the Sprint |
 
---
 
## 🎨 User Interface (What Students Should See on Screen)
 
Add a new tab called **"Milestone 2: Workflow & Collaboration"** with:

1. **Workflow Card**: Displays active bugs with a dropdown to change their status:

   `REPORTED ➔ TRIAGED ➔ IN_PROGRESS ➔ QA_VERIFICATION ➔ RESOLVED ➔ CLOSED`

2. **Live Activity Stream**: A feed showing recent updates (e.g., *"Admin assigned Bug #2 to John Doe 5 mins ago"*).

3. **Sprint Board**: Two side-by-side columns:

   - **Left Column**: Active Sprints (shows total issues and completion progress bar).

   - **Right Column**: Backlog (bugs not yet in a sprint, with an `+ Add to Sprint` button).

4. **Action Button**: A `Generate PDF Report` button that exports a summary.
 
---
 
## ✅ Step-by-Step Student Checklist to Test Your Work
 
- [ ] **Test 1 (Priority Math)**: Submit a `CRITICAL` severity bug under `Security Vulnerability` category $\rightarrow$ Verify that the system assigns a Priority of **`URGENT`** (Score: 12.0).

- [ ] **Test 2 (Smart Match)**: Submit a bug with the word *"database connection timeout"* $\rightarrow$ Verify that the backend/database developer appears as the top recommendation.

- [ ] **Test 3 (Chat & Comments)**: Open a bug, type a comment, refresh the page $\rightarrow$ Verify the comment is still there and visible.

- [ ] **Test 4 (Sprint Assignment)**: Create a new Sprint called *"Sprint 2"*, click `+ Add to Sprint` on a backlog bug $\rightarrow$ Verify the bug moves into Sprint 2.

- [ ] **Test 5 (Audit Log)**: Change a bug status $\rightarrow$ Verify an entry appears in the activity history showing the old and new status.
    

module-3
### Part 1: Automated CI/CD Git Webhook 🤖

When a programmer finishes fixing a bug in code and pushes a Git commit, they write a commit message like:
> `"Merge PR #45: fixes #2 login password crash"`
 
#### How your Webhook Bot works:

1. When GitHub or a build pipeline sends a `POST /api/v1/webhooks/git` request with a commit message...

2. Your backend searches the message text for keywords like `fixes #2`, `closes #5`, or `resolves #8`.

3. If it finds a matching bug ID (e.g. Bug `#2`), the backend **automatically transitions that bug's status to `QA_VERIFICATION`** and records an audit log entry: *"Auto-transitioned by Git commit #a7f8c92"*.

4. No manual clicking needed!
 
---
 
### Part 2: Software Quality Scorecard & Metrics 📊

Calculate 4 core software engineering metrics in Python using simple math:
 
1. **Fix Rate Percentage (%)**:

   $$\text{Fix Rate} = \frac{\text{Resolved Bugs} + \text{Closed Bugs}}{\text{Total Bugs}} \times 100$$

   *(Example: If 17 out of 20 bugs are fixed, your fix rate is $85\%$)*
 
2. **Mean Time to Resolution (MTTR)**:

   $$\text{MTTR} = \text{Average hours from Bug Created to Bug Resolved}$$

   *(Tells you how fast your team fixes problems, e.g. "Average fix time: 2.5 days")*
 
3. **Defect Leakage Rate (%)**:

   $$\text{Leakage Rate} = \frac{\text{Bugs found in Production Environment}}{\text{Total Bugs}} \times 100$$

   *(Tells you how many bugs escaped into the real world instead of being caught during testing)*
 
4. **Backlog Health Score (Out of 100)**:

   A health score from $0$ to $100$ where open Critical bugs reduce points. A high score ($90+$) means the project is clean and ready for release!
 
---
 
### Part 3: Interactive Plotly Visualizations 📈

Display visual graphs using **Plotly.js** directly inside the web browser:
 
1. **Defect Trend Line Chart (Last 14 Days)**:

   - 🔴 **Red Line**: Number of new bugs reported each day.

   - 🟢 **Green Line**: Number of bugs resolved each day.

   - *(If the green line is higher than the red line, the team is winning!)*

2. **Severity Donut Chart**:

   - Colorful pie chart showing the percentage of `CRITICAL`, `MAJOR`, `MINOR`, and `TRIVIAL` bugs.

3. **Workflow Pipeline Bar Chart**:

   - Bar chart showing how many bugs are currently sitting in each stage (`REPORTED`, `IN_PROGRESS`, `QA_VERIFICATION`, `RESOLVED`).
 
---
 
### Part 4: One-Click PDF & CSV Exporter 📄

Managers, teachers, and clients love printable reports:
 
1. **PDF Report (`/api/v1/export/pdf`)**:

   - Uses Python's `fpdf2` or `reportlab` library to generate a formatted PDF.

   - Includes: Project Title, Executive Summary Table, Defect Counts, and a list of Recent Critical Bugs.

2. **CSV Export (`/api/v1/export/csv`)**:

   - Generates a downloadable `.csv` spreadsheet file that can be opened in Microsoft Excel or Google Sheets.
 
---
 
## 📡 API Endpoints to Create
 
| Endpoint | Method | What it does (in plain English) |

| :--- | :--- | :--- |

| `/api/v1/webhooks/git` | `POST` | Ingests a Git commit message and auto-advances matching bug tickets |

| `/api/v1/analytics/quality-metrics` | `GET` | Returns Fix Rate %, MTTR, Leakage %, and Health Score in JSON |

| `/api/v1/analytics/defect-trends` | `GET` | Returns daily bug counts for the last 14 days |

| `/api/v1/analytics/plotly-charts` | `GET` | Returns ready-to-render Plotly chart configs |

| `/api/v1/export/pdf` | `GET` | Generates and downloads the PDF Quality Report |

| `/api/v1/export/csv` | `GET` | Downloads the raw bug registry as an Excel-ready CSV |
 
---
 
## 🎨 User Interface (What Students Should See on Screen)
 
Add a new tab called **"Milestone 3: Analytics & APIs"** with:

1. **Service Banner**: Shows `Notification Service: Running` and `Security Status: CI/CD Sync Active`, plus **"Export PDF"** and **"Export CSV"** buttons.

2. **Live REST API Explorer**: A built-in tester where students can click "Send" on endpoints like `GET /api/v1/issues/` and see the real JSON response on screen.

3. **Webhook Simulator**: A button labeled *"Simulate Git Commit (fixes #2)"* that triggers the CI/CD webhook and updates the bug live!

4. **Interactive Plotly Graph**: A zoomable chart showing the 14-day bug resolution trends.
 
---
 
## ✅ Step-by-Step Student Checklist to Test Your Work
 
- [ ] **Test 1 (Git Webhook)**: Send a POST request to `/api/v1/webhooks/git` with message `"fixes #2"` $\rightarrow$ Verify that Bug #2 status automatically changes to **`QA_VERIFICATION`**.

- [ ] **Test 2 (Metrics Math)**: Check `/api/v1/analytics/quality-metrics` $\rightarrow$ Verify that `fix_rate_percentage` and `mean_time_to_resolution_hours` calculate correctly.

- [ ] **Test 3 (Plotly Charts)**: Open the Milestone 3 tab in your browser $\rightarrow$ Verify that the line graph and donut chart render with interactive hover tooltips.

- [ ] **Test 4 (PDF Download)**: Click `Export PDF` $\rightarrow$ Verify a `.pdf` file downloads and opens cleanly with formatted summary tables and headers.

- [ ] **Test 5 (CSV Download)**: Click `Export CSV` $\rightarrow$ Verify an Excel-compatible `.csv` file downloads with all bug rows.
 
CI/CD Git Webhook Bot │ Auto-moves bugs to QA when a commit arrives Quality Health Score │ Calculates MTTR, Fix Rate %, & Leakage Rate │ │ 3. Interactive Charts │ Colorful Plotly graphs for defect trends │ │ 4. PDF & CSV Exporter │ Download printable project report summaries


module-4
---

### Part 1: Team Productivity & Developer Workload Matrix 🧑‍💼
Engineering managers need to see how balanced the team is so developers don't get burned out:
1. **Developer Workload Table**:
   - Lists every developer (`John Doe`, `Alice Smith`, `Bruce Wayne`).
   - Shows their **Team** (e.g. *Backend Engineering*, *Frontend UI*).
   - Counts their **Active Tasks** (bugs currently in `IN_PROGRESS` or `CODE_REVIEW`).
   - Counts their **Completed Fixes** (bugs marked `RESOLVED` or `CLOSED`).
   - Shows their **Average MTTR** (average fix turnaround speed in hours).
2. **Resource Balance Indicator**:
   - Helps managers spot if one developer has 8 tasks while another has only 1, making reassignments easy.

---

### Part 2: Database Speed Optimization (Handling 50,000+ Bugs) ⚡
When a company tracks tens of thousands of bugs, a regular database can become slow. You will make BugFlow lightning-fast ($< 300\text{ms}$ response time) using two techniques:

1. **Database Indexing (SQLAlchemy / PostgreSQL)**:
   - Think of a book index at the back of a textbook: instead of reading all 50,000 pages to find a topic, you jump directly to the page number!
   - Add database indexes on frequently searched columns: `(project_id, status)`, `(assignee_id, status)`, and `(created_at)`.
2. **Database Connection Pooling**:
   - Keep a pool of reusable connections ready (`pool_size=20`, `max_overflow=10`, `pool_pre_ping=True`) so PostgreSQL never runs out of connections during traffic spikes.
3. **Pagination Support**:
   - Implement `skip` and `limit` in all search endpoints so the server only sends 20 to 50 records at a time instead of 50,000 all at once.

---

### Part 3: Automated Pytest Testing Suite 🧪
Write automated unit and integration tests in Python (`pytest`) to prove the application has zero bugs:
- **`test_auth.py`**: Tests user registration, password hashing with `bcrypt`, JWT token issuance, and role access (`ADMIN`, `DEVELOPER`, `TESTER`).
- **`test_issues.py`**: Tests bug creation, automated priority scoring math, valid state transitions (`REPORTED` $\rightarrow$ `TRIAGED` $\rightarrow$ `IN_PROGRESS` $\rightarrow$ `RESOLVED`), and duplicate detection.
- **`test_sprints.py`**: Tests sprint creation, moving backlog issues into a sprint, and velocity calculation.
- **`test_analytics.py`**: Tests MTTR calculation and Plotly chart JSON generation.

---

### Part 4: Docker Containerization & Documentation 🐳📖
Package the entire project so anyone in the world can run it on Windows, Mac, or Linux with a single command:

1. **`Dockerfile`**:
   - Uses `python:3.11-slim` as the base image.
   - Installs system dependencies for PostgreSQL, copies code, and runs `uvicorn`.
2. **`docker-compose.yml`**:
   - Spawns both the **FastAPI app** and a **PostgreSQL 15 container** with persistent data storage volumes and health checks.
3. **Documentation Guides**:
   - **`README.md`**: Clean setup instructions, architecture diagrams, and quick-start guide.
   - **`API_DOCUMENTATION.md`**: Complete payload examples and endpoint references.

---

## 📡 API Endpoints for Module 4

| Endpoint | Method | What it does (in plain English) |
| :--- | :--- | :--- |
| `/api/v1/analytics/developer-workload` | `GET` | Returns task load and average fix speed for each developer |
| `/health` | `GET` | Health check endpoint returning platform status and database connection |
| `/docs` | `GET` | Interactive Swagger API documentation |
| `/redoc` | `GET` | Clean alternative API reference manual |

---

## 🎨 User Interface (What Students Should See on Screen)

Add a new tab called **"Milestone 4: Optimization & Finalization"** featuring:
1. **Top 4 KPI Metric Boxes**:
   - **Bug Fix Rate**: e.g., `85% (Resolved & Closed)`
   - **Average Fix Time (MTTR)**: e.g., `2.5 days (Turnaround Speed)`
   - **Backlog Health Score**: e.g., `92 / 100 (Optimal)`
   - **Defect Leakage Rate**: e.g., `4.2% (Production Escapes)`
2. **System Scale & Performance Card**:
   - Displays: `Max DB Pool: 125 active capacity`, `Avg Response Time: 180ms (Target: < 300ms)`, `Stress Capacity: 50,000+ issues`.
3. **Database Performance Checklist**:
   - Shows green checkmarks: `✔ PostgreSQL Composite Indexes Active`, `✔ Connection Pooling Enabled`, `✔ Zero Critical Security Violations`.
4. **Developer Productivity Matrix Table**:
   - Clean table showing every developer's Active Tasks, Completed Tasks, and Average Resolution Time.
5. **Action Button**:
   - A button labeled **"Publish All Documentation & Guides"** that alerts the user with links to `/docs` and `/README.md`.

---

## ✅ Step-by-Step Student Checklist to Test Your Work

- [ ] **Test 1 (Run Pytest)**: Run `pytest tests/ -v` in your terminal $\rightarrow$ Verify that all test cases pass with 100% green checkmarks (`PASSED`).
- [ ] **Test 2 (Developer Workload)**: Check the Milestone 4 tab in your browser $\rightarrow$ Verify that developers show their real active bug count and completed fixes.
- [ ] **Test 3 (Database Performance)**: Verify that searching and filtering 50+ bugs returns results in under 300ms without lag.
- [ ] **Test 4 (Health Check)**: Visit `http://localhost:8000/health` $\rightarrow$ Verify it returns `{"status": "healthy", "database": "postgresql"}`.
- [ ] **Test 5 (Docker Build)**: Run `docker compose up --build` $\rightarrow$ Verify that both the web server and PostgreSQL database launch automatically.
 
 