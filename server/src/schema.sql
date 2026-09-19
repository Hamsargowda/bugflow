-- BugFlow schema
-- Run this once against your Postgres database before starting the server,
-- e.g.  psql -U postgres -d bugflow -f src/schema.sql

DROP TABLE IF EXISTS attachments CASCADE;
DROP TABLE IF EXISTS activity CASCADE;
DROP TABLE IF EXISTS comments CASCADE;
DROP TABLE IF EXISTS issue_tags CASCADE;
DROP TABLE IF EXISTS issues CASCADE;
DROP TABLE IF EXISTS sprints CASCADE;

-- ---------------------------------------------------------------------
-- Sprints (Milestone 2 — Agile Sprint Planning)
-- ---------------------------------------------------------------------
CREATE TABLE sprints (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  goal        TEXT,
  start_date  DATE,
  end_date    DATE,
  status      TEXT NOT NULL DEFAULT 'PLANNING'
              CHECK (status IN ('PLANNING', 'ACTIVE', 'COMPLETED')),
  velocity    INTEGER,                 -- frozen at the moment the sprint is COMPLETED
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- Issues
-- ---------------------------------------------------------------------
CREATE TABLE issues (
  id             TEXT PRIMARY KEY,
  project        TEXT NOT NULL,
  title          TEXT NOT NULL,
  description    TEXT NOT NULL,
  severity       TEXT NOT NULL,
  priority       TEXT NOT NULL,
  module         TEXT NOT NULL,
  environment    TEXT NOT NULL,
  category       TEXT NOT NULL DEFAULT 'Backend Logic'
                 CHECK (category IN ('Security Vulnerability', 'Database Error', 'API Gateway', 'Backend Logic', 'UI Glitch')),
  priority_score NUMERIC,             -- computed by the Smart Priority Calculator
  reporter       TEXT NOT NULL,
  assignee       TEXT NOT NULL DEFAULT 'Unassigned',
  status         TEXT NOT NULL DEFAULT 'Open',
  in_sprint      BOOLEAN NOT NULL DEFAULT FALSE,   -- legacy flag, kept for the original Sprint Board tab
  sprint_id      TEXT REFERENCES sprints(id) ON DELETE SET NULL,  -- Milestone 2 sprint/backlog assignment
  due_date       DATE,                              -- resolution deadline, set by Admin on assignment
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at    TIMESTAMPTZ,

  -- ------------------------------------------------------------------
  -- Resolution report workflow (assignee -> Admin -> reporter)
  --   1. Assignee resolves the issue, then writes up a resolution report
  --      describing what they did and submits it to the Admin.
  --   2. Admin reviews that report, then writes their own short update
  --      message and sends it on to the original reporter.
  -- ------------------------------------------------------------------
  resolution_report    TEXT,                          -- what the assignee did to fix it
  resolution_report_at TIMESTAMPTZ,                    -- when the assignee submitted it
  admin_response        TEXT,                          -- Admin's message to the reporter
  admin_response_at     TIMESTAMPTZ,                    -- when the Admin sent it
  report_status         TEXT NOT NULL DEFAULT 'none'
                         CHECK (report_status IN ('none', 'submitted', 'sent'))
);

CREATE TABLE issue_tags (
  id        SERIAL PRIMARY KEY,
  issue_id  TEXT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  tag       TEXT NOT NULL,
  UNIQUE (issue_id, tag)
);

CREATE TABLE comments (
  id        TEXT PRIMARY KEY,
  issue_id  TEXT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  author    TEXT NOT NULL,
  text      TEXT NOT NULL,
  at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- Attachments (Milestone 2 — screenshots / logs on a ticket)
-- ---------------------------------------------------------------------
CREATE TABLE attachments (
  id           TEXT PRIMARY KEY,
  issue_id     TEXT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  filename     TEXT NOT NULL,
  mime_type    TEXT NOT NULL,
  data         BYTEA NOT NULL,
  uploaded_by  TEXT NOT NULL,
  uploaded_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE activity (
  id          TEXT PRIMARY KEY,
  issue_id    TEXT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,
  text        TEXT NOT NULL,
  old_value   TEXT,
  new_value   TEXT,
  at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor       TEXT
);

CREATE INDEX idx_issue_tags_issue_id  ON issue_tags(issue_id);
CREATE INDEX idx_comments_issue_id    ON comments(issue_id);
CREATE INDEX idx_attachments_issue_id ON attachments(issue_id);
CREATE INDEX idx_activity_issue_id    ON activity(issue_id);
CREATE INDEX idx_issues_project       ON issues(project);
CREATE INDEX idx_issues_status        ON issues(status);
CREATE INDEX idx_issues_sprint        ON issues(sprint_id);

-- ---------------------------------------------------------------------
-- Milestone 4 — composite indexes for 50,000+ issue scale.
-- These back the two most common list-view query shapes (filter by
-- project + status, filter by assignee + status) plus the default
-- "newest first" sort, so Postgres can use an index instead of a full
-- table scan as `issues` grows.
-- ---------------------------------------------------------------------
CREATE INDEX idx_issues_project_status  ON issues(project, status);
CREATE INDEX idx_issues_assignee_status ON issues(assignee, status);
CREATE INDEX idx_issues_created_at      ON issues(created_at DESC);

-- ---------------------------------------------------------------------
-- Authentication users (+ Milestone 2 developer skill profiles)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  username      TEXT UNIQUE NOT NULL,
  display_name  TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('Developer', 'Tester', 'Project Manager', 'Admin', 'User', 'Triager', 'Stakeholder')),
  core_skills   TEXT[] NOT NULL DEFAULT '{}',   -- e.g. '{PostgreSQL,Backend,API}'
  password_hash TEXT NOT NULL,
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Widen the role check in case this table already existed from before the
-- "User" role was added (CREATE TABLE IF NOT EXISTS above is a no-op then).
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('Developer', 'Tester', 'Project Manager', 'Admin', 'User', 'Triager', 'Stakeholder'));

-- ---------------------------------------------------------------------
-- Notifications (User role workflow — created/assigned/resolved/report)
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS notifications CASCADE;
CREATE TABLE notifications (
  id            TEXT PRIMARY KEY,
  recipient_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  issue_id      TEXT REFERENCES issues(id) ON DELETE CASCADE,
  type          TEXT NOT NULL CHECK (type IN ('issue_created', 'assigned', 'resolved', 'resolved_admin', 'report_submitted', 'overdue')),
  message       TEXT NOT NULL,
  read          BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_notifications_recipient ON notifications(recipient_id, read);
