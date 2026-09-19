import { pool } from "./db.js";

const ISSUE_COLUMNS = `
  id, project, title, description, severity, priority, module, environment,
  category, priority_score AS "priorityScore",
  reporter, assignee, status, in_sprint AS "inSprint", sprint_id AS "sprintId",
  due_date AS "dueDate",
  created_at AS "createdAt", updated_at AS "updatedAt", resolved_at AS "resolvedAt",
  resolution_report AS "resolutionReport", resolution_report_at AS "resolutionReportAt",
  admin_response AS "adminResponse", admin_response_at AS "adminResponseAt",
  report_status AS "reportStatus"
`;

function rowToIssue(row) {
  return {
    ...row,
    tags: [],
    comments: [],
    activity: [],
    attachments: [],
  };
}

const MAX_PAGE_SIZE = 200;

/**
 * Milestone 4 — pagination support. Clamps arbitrary skip/limit query
 * params into safe bounds (no negative offsets, no unbounded page sizes
 * that would defeat the point of paginating a 50,000+ row table). Pure
 * function so it's unit-testable without a database.
 */
export function clampPagination(skip, limit) {
  const s = Number.isFinite(Number(skip)) ? Math.max(0, Math.trunc(Number(skip))) : 0;
  const rawLimit = Number.isFinite(Number(limit)) ? Math.trunc(Number(limit)) : null;
  const l = rawLimit === null ? null : Math.min(Math.max(1, rawLimit), MAX_PAGE_SIZE);
  return { skip: s, limit: l };
}

/**
 * Load every issue plus its tags/comments/activity/attachments, sorted
 * newest-created first.
 *
 * Milestone 4: pass `{ skip, limit }` to page through a large table
 * instead of loading all 50,000+ rows at once — the response shape then
 * becomes `{ items, total, skip, limit }` instead of a bare array, so
 * existing callers that omit both params are unaffected.
 */
export async function loadAllIssues({ skip, limit } = {}) {
  const { skip: safeSkip, limit: safeLimit } = clampPagination(skip, limit);

  if (safeLimit === null) {
    const { rows: issueRows } = await pool.query(
      `SELECT ${ISSUE_COLUMNS} FROM issues ORDER BY created_at DESC`
    );
    return attachChildren(issueRows);
  }

  const [{ rows: issueRows }, { rows: totalRows }] = await Promise.all([
    pool.query(`SELECT ${ISSUE_COLUMNS} FROM issues ORDER BY created_at DESC LIMIT $1 OFFSET $2`, [safeLimit, safeSkip]),
    pool.query(`SELECT COUNT(*)::int AS total FROM issues`),
  ]);
  const items = await attachChildren(issueRows);
  return { items, total: totalRows[0].total, skip: safeSkip, limit: safeLimit };
}

async function attachChildren(issueRows) {
  if (issueRows.length === 0) return [];

  const ids = issueRows.map((r) => r.id);
  const [{ rows: tagRows }, { rows: commentRows }, { rows: activityRows }, { rows: attachmentRows }] = await Promise.all([
    pool.query(`SELECT issue_id, tag FROM issue_tags WHERE issue_id = ANY($1) ORDER BY id ASC`, [ids]),
    pool.query(
      `SELECT id, issue_id, author, text, at FROM comments WHERE issue_id = ANY($1) ORDER BY at ASC`,
      [ids]
    ),
    pool.query(
      `SELECT id, issue_id, type, text, old_value AS "oldValue", new_value AS "newValue", at, actor
         FROM activity WHERE issue_id = ANY($1) ORDER BY at ASC`,
      [ids]
    ),
    pool.query(
      `SELECT id, issue_id, filename, mime_type AS "mimeType", uploaded_by AS "uploadedBy", uploaded_at AS "uploadedAt"
         FROM attachments WHERE issue_id = ANY($1) ORDER BY uploaded_at ASC`,
      [ids]
    ),
  ]);

  const byId = new Map(issueRows.map((r) => [r.id, rowToIssue(r)]));
  for (const t of tagRows) byId.get(t.issue_id)?.tags.push(t.tag);
  for (const c of commentRows) byId.get(c.issue_id)?.comments.push({ id: c.id, author: c.author, text: c.text, at: c.at });
  for (const a of activityRows) byId.get(a.issue_id)?.activity.push({ id: a.id, type: a.type, text: a.text, oldValue: a.oldValue, newValue: a.newValue, at: a.at, actor: a.actor });
  for (const f of attachmentRows) {
    byId.get(f.issue_id)?.attachments.push({
      id: f.id, filename: f.filename, mimeType: f.mimeType, uploadedBy: f.uploadedBy, uploadedAt: f.uploadedAt,
      url: `/api/issues/${f.issue_id}/attachments/${f.id}`,
    });
  }

  return issueRows.map((r) => byId.get(r.id));
}

/** Load a single issue (with tags/comments/activity/attachments) by id, or null if missing. */
export async function loadIssue(id) {
  const { rows } = await pool.query(`SELECT ${ISSUE_COLUMNS} FROM issues WHERE id = $1`, [id]);
  if (rows.length === 0) return null;

  const issue = rowToIssue(rows[0]);
  const [{ rows: tagRows }, { rows: commentRows }, { rows: activityRows }, { rows: attachmentRows }] = await Promise.all([
    pool.query(`SELECT tag FROM issue_tags WHERE issue_id = $1 ORDER BY id ASC`, [id]),
    pool.query(`SELECT id, author, text, at FROM comments WHERE issue_id = $1 ORDER BY at ASC`, [id]),
    pool.query(
      `SELECT id, type, text, old_value AS "oldValue", new_value AS "newValue", at, actor
         FROM activity WHERE issue_id = $1 ORDER BY at ASC`,
      [id]
    ),
    pool.query(
      `SELECT id, filename, mime_type AS "mimeType", uploaded_by AS "uploadedBy", uploaded_at AS "uploadedAt"
         FROM attachments WHERE issue_id = $1 ORDER BY uploaded_at ASC`,
      [id]
    ),
  ]);

  issue.tags = tagRows.map((t) => t.tag);
  issue.comments = commentRows;
  issue.activity = activityRows;
  issue.attachments = attachmentRows.map((f) => ({ ...f, url: `/api/issues/${id}/attachments/${f.id}` }));
  return issue;
}
