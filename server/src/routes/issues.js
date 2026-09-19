import { Router } from "express";
import multer from "multer";
import { pool } from "../db.js";
import { loadAllIssues, loadIssue } from "../issueLoader.js";
import { requireAuth, requireRoles } from "../auth.js";
import { computePriorityScore, priorityLabelForScore, recommendDevelopers, jaccardSimilarity } from "../matcher.js";
import { notifyUser, notifyAdmins, findUserIdByDisplayName } from "../notifications.js";

export const issuesRouter = Router();
issuesRouter.use(requireAuth);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }, // 8MB
  fileFilter(req, file, cb) {
    const okExt = /\.(png|jpe?g|log)$/i.test(file.originalname);
    const okMime = ["image/png", "image/jpeg", "text/plain", "application/octet-stream"].includes(file.mimetype);
    if (okExt || okMime) return cb(null, true);
    cb(new Error("Only .png, .jpg, or .log files are allowed"));
  },
});

function newId(prefix) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/* Allowed columns a PATCH is permitted to touch, mapped to their DB column name. */
const PATCHABLE_FIELDS = {
  status: "status",
  assignee: "assignee",
  inSprint: "in_sprint",
  resolvedAt: "resolved_at",
  severity: "severity",
  priority: "priority",
  category: "category",
  dueDate: "due_date",
};

/* ------------------------------------------------------------------ */
/*  POST /api/issues/triage-recommendation                             */
/*  Smart Priority Calculator + Smart Developer Matcher (preview only,  */
/*  doesn't touch the database — Admin uses this while filling in the   */
/*  Triage panel, then submits the real PATCH separately).              */
/* ------------------------------------------------------------------ */
issuesRouter.post("/triage-recommendation", requireRoles("Admin"), async (req, res, next) => {
  const { title = "", description = "", severity, category } = req.body || {};
  if (!severity || !category) {
    return res.status(400).json({ error: "severity and category are required" });
  }
  try {
    const score = computePriorityScore(severity, category);
    const { label, display } = priorityLabelForScore(score);

    const { rows: devRows } = await pool.query(
      `SELECT id, display_name AS "displayName", core_skills AS "coreSkills"
         FROM users WHERE role = 'Developer' AND active = TRUE`
    );
    const { rows: workloadRows } = await pool.query(
      `SELECT assignee, COUNT(*)::int AS open_count
         FROM issues
        WHERE status NOT IN ('Resolved', 'Closed')
        GROUP BY assignee`
    );
    // Map assignee display name -> open count, then to developer id.
    const openCountByName = Object.fromEntries(workloadRows.map((r) => [r.assignee, r.open_count]));
    const openCountsById = Object.fromEntries(
      devRows.map((d) => [d.id, openCountByName[d.displayName] || 0])
    );

    const recommendations = recommendDevelopers(`${title} ${description}`, devRows, openCountsById);

    res.json({ priorityScore: score, priorityLabel: label, priority: display, recommendations });
  } catch (err) {
    next(err);
  }
});

/* ------------------------------------------------------------------ */
/*  POST /api/issues/check-duplicates — Module 1 duplicate detection  */
/*  Warn when title similarity with an active issue reaches 55%.       */
/* ------------------------------------------------------------------ */
issuesRouter.post("/check-duplicates", async (req, res, next) => {
  const { title = "", project } = req.body || {};
  if (!title.trim()) return res.status(400).json({ error: "title is required" });
  try {
    const params = project ? [project] : [];
    const where = project ? "WHERE status NOT IN ('Resolved','Closed') AND project = $1" : "WHERE status NOT IN ('Resolved','Closed')";
    const { rows } = await pool.query(`SELECT id, title, project, status FROM issues ${where} ORDER BY created_at DESC LIMIT 500`, params);
    const matches = rows.map((issue) => ({ ...issue, similarity: Number((jaccardSimilarity(title, issue.title) * 100).toFixed(1)) }))
      .filter((issue) => issue.similarity >= 55)
      .sort((a,b) => b.similarity - a.similarity);
    res.json({ duplicate: matches.length > 0, threshold: 55, matches });
  } catch (err) { next(err); }
});

/* ------------------------------------------------------------------ */
/*  GET /api/issues — full list, or a page via ?skip=&limit=            */
/*  (Milestone 4: paginated so the UI never has to pull all 50,000+      */
/*  rows over the wire at once. Omitting both params keeps the original  */
/*  bare-array response so the existing client is unaffected.)           */
/* ------------------------------------------------------------------ */
issuesRouter.get("/", async (req, res, next) => {
  try {
    const { skip, limit } = req.query;
    const issues = await loadAllIssues(limit !== undefined || skip !== undefined ? { skip, limit } : {});
    res.json(issues);
  } catch (err) {
    next(err);
  }
});

/* ------------------------------------------------------------------ */
/*  POST /api/issues — create                                          */
/* ------------------------------------------------------------------ */
issuesRouter.post("/", async (req, res, next) => {
  const {
    title, description, severity, priority, project, module, environment, category,
    reporter, tags = [],
  } = req.body || {};

  if (!title?.trim() || !description?.trim() || !reporter?.trim()) {
    return res.status(400).json({ error: "title, description, and reporter are required" });
  }

  const resolvedCategory = category || "Backend Logic";
  const priorityScore = computePriorityScore(severity, resolvedCategory);
  const computedPriority = priority || priorityLabelForScore(priorityScore).display;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows } = await client.query(
      `SELECT id FROM issues WHERE id ~ '^BUG-[0-9]+$' ORDER BY (regexp_replace(id, 'BUG-', ''))::int DESC LIMIT 1`
    );
    const nextNum = rows.length ? parseInt(rows[0].id.split("-")[1], 10) + 1 : 1001;
    const id = `BUG-${nextNum}`;
    const now = new Date().toISOString();

    // Reporting an issue never sets an assignee — every issue starts Unassigned,
    // outside any sprint (sprint_id NULL = Backlog).
    await client.query(
      `INSERT INTO issues
        (id, project, title, description, severity, priority, module, environment, category, priority_score,
         reporter, assignee, status, in_sprint, sprint_id, created_at, updated_at, resolved_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'Unassigned','Open',FALSE,NULL,$12,$12,NULL)`,
      [id, project, title.trim(), description.trim(), severity, computedPriority, module, environment,
        resolvedCategory, priorityScore, (req.user.displayName || reporter.trim()), now]
    );

    for (const tag of tags) {
      await client.query(
        `INSERT INTO issue_tags (issue_id, tag) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
        [id, tag.trim().toLowerCase()]
      );
    }

    await client.query(
      `INSERT INTO activity (id, issue_id, type, text, at, actor) VALUES ($1,$2,'created','Issue created',$3,$4)`,
      [newId("act"), id, now, req.user.displayName || reporter.trim() || "You"]
    );

    // The "User" role is a reporting-only role — let every Admin know a new
    // issue came in from a user so it can be triaged and assigned.
    if (req.user.role === "User") {
      await notifyAdmins(client, {
        issueId: id,
        type: "issue_created",
        message: `${req.user.displayName} reported a new issue: "${title.trim()}"`,
      });
    }

    await client.query("COMMIT");
    const issue = await loadIssue(id);
    res.status(201).json(issue);
  } catch (err) {
    await client.query("ROLLBACK");
    next(err);
  } finally {
    client.release();
  }
});

/* ------------------------------------------------------------------ */
/*  PATCH /api/issues/:id — status change, assignment, sprint move,     */
/*  triage (severity/priority/category)                                 */
/*  Body: { patch: {...}, activity?: { type, text, actor, oldValue?,     */
/*          newValue? } }                                               */
/* ------------------------------------------------------------------ */
issuesRouter.patch("/:id", async (req, res, next) => {
  const { id } = req.params;
  const { patch = {}, activity } = req.body || {};

  const allowed = {
    Developer: new Set(["status", "inSprint", "resolvedAt"]),
    Triager: new Set(["status", "assignee", "severity", "priority", "category"]),
    Tester: new Set(),
    User: new Set(),
    "Project Manager": new Set(["status", "inSprint", "resolvedAt"]),
    Admin: new Set(["status", "assignee", "inSprint", "resolvedAt", "severity", "priority", "category", "dueDate"]),
  };
  for (const key of Object.keys(patch)) {
    if (!allowed[req.user.role]?.has(key)) {
      return res.status(403).json({ error: `Role ${req.user.role} cannot change ${key}` });
    }
  }

  // Server-side triage gate: an issue must be triaged (i.e. no longer "Open")
  // before it can be assigned — mirrors the client's TriagePanel/assign gate so
  // a direct API call can't skip the workflow.
  if ("assignee" in patch && !("status" in patch)) {
    const { rows } = await pool.query(`SELECT status FROM issues WHERE id = $1`, [id]);
    if (rows[0] && rows[0].status === "Open") {
      return res.status(409).json({ error: "Triage this issue before assigning it" });
    }
  }

  // If severity or category changed, recompute the priority score server-side
  // so it never drifts from the Smart Priority Calculator formula.
  if ("severity" in patch || "category" in patch) {
    const { rows } = await pool.query(`SELECT severity, category FROM issues WHERE id = $1`, [id]);
    if (rows[0]) {
      const severity = patch.severity ?? rows[0].severity;
      const category = patch.category ?? rows[0].category;
      patch.priorityScore = computePriorityScore(severity, category);
    }
  }

  const setClauses = [];
  const values = [];
  let i = 1;
  const fieldMap = { ...PATCHABLE_FIELDS, priorityScore: "priority_score" };
  for (const [key, col] of Object.entries(fieldMap)) {
    if (key in patch) {
      setClauses.push(`${col} = $${i++}`);
      values.push(patch[key]);
    }
  }
  setClauses.push(`updated_at = now()`);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: beforeRows } = await client.query(
      `SELECT reporter, assignee, status, title, due_date AS "dueDate" FROM issues WHERE id = $1`,
      [id]
    );
    const before = beforeRows[0];
    if (!before) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Issue not found" });
    }

    if (patch.status !== undefined) {
      const transitions = {
        "Open": new Set(["Triaged"]),
        "Triaged": new Set(["In Progress"]),
        "In Progress": new Set(["In Review"]),
        "In Review": new Set(["QA Verification"]),
        "QA Verification": new Set(["Resolved"]),
        "Resolved": new Set(["Closed", "In Progress"]),
        "Closed": new Set(["In Progress"]),
      };
      if (!transitions[before.status]?.has(patch.status) && before.status !== patch.status) {
        await client.query("ROLLBACK");
        return res.status(409).json({ error: `Invalid status transition: ${before.status} -> ${patch.status}` });
      }
    }

    if (setClauses.length > 0) {
      values.push(id);
      const { rowCount } = await client.query(
        `UPDATE issues SET ${setClauses.join(", ")} WHERE id = $${i}`,
        values
      );
      if (rowCount === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "Issue not found" });
      }
    }

    if (patch.status === "Resolved" || patch.status === "Closed") {
      await client.query(`UPDATE issues SET resolved_at = COALESCE(resolved_at, now()) WHERE id = $1`, [id]);
    } else if (patch.status === "In Progress" && ["Resolved", "Closed"].includes(before.status)) {
      await client.query(`UPDATE issues SET resolved_at = NULL WHERE id = $1`, [id]);
    }

    if (activity?.text) {
      await client.query(
        `INSERT INTO activity (id, issue_id, type, text, old_value, new_value, at, actor)
         VALUES ($1,$2,$3,$4,$5,$6,now(),$7)`,
        [newId("act"), id, activity.type || "update", activity.text, activity.oldValue || null, activity.newValue || null, activity.actor || null]
      );
    }

    // ---- Notifications --------------------------------------------------
    if (before) {
      // Admin assigned (or reassigned) this issue to someone — let them know,
      // including the deadline if one was set in the same request.
      if ("assignee" in patch && patch.assignee && patch.assignee !== "Unassigned" && patch.assignee !== before.assignee) {
        const assigneeId = await findUserIdByDisplayName(client, patch.assignee);
        const due = "dueDate" in patch ? patch.dueDate : before.dueDate;
        const dueText = due ? ` Due ${new Date(due).toLocaleDateString()}.` : "";
        await notifyUser(client, {
          recipientId: assigneeId,
          issueId: id,
          type: "assigned",
          message: `You were assigned ${id}: "${before.title}".${dueText}`,
        });
      }

      // Status moved to Resolved/Closed — notify every Admin so they know to
      // expect a resolution report from the assignee. The reporter is NOT
      // notified yet: they only hear about it once the Admin has reviewed
      // that report and sent their own update (see the resolution-report and
      // admin-response endpoints below).
      const newStatus = patch.status;
      const justResolved = newStatus && ["Resolved", "Closed"].includes(newStatus) && !["Resolved", "Closed"].includes(before.status);
      if (justResolved) {
        await notifyAdmins(client, {
          issueId: id,
          type: "resolved_admin",
          message: `${before.assignee} marked ${id} "${before.title}" as ${newStatus} — waiting on their resolution report.`,
          excludeUserId: req.user.sub,
        });
      }
    }

    await client.query("COMMIT");
    const issue = await loadIssue(id);
    if (!issue) return res.status(404).json({ error: "Issue not found" });
    res.json(issue);
  } catch (err) {
    await client.query("ROLLBACK");
    next(err);
  } finally {
    client.release();
  }
});

/* ------------------------------------------------------------------ */
/*  POST /api/issues/:id/resolution-report                             */
/*  The assignee writes up what they did to fix a Resolved/Closed issue */
/*  and sends it to every Admin for review.                             */
/*  Body: { reportText }                                                */
/* ------------------------------------------------------------------ */
issuesRouter.post("/:id/resolution-report", async (req, res, next) => {
  const { id } = req.params;
  const { reportText } = req.body || {};
  if (!reportText?.trim()) {
    return res.status(400).json({ error: "reportText is required" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `SELECT title, assignee, status FROM issues WHERE id = $1 FOR UPDATE`,
      [id]
    );
    const before = rows[0];
    if (!before) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Issue not found" });
    }
    if (!["Resolved", "Closed"].includes(before.status)) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "The issue must be Resolved or Closed before a report can be submitted" });
    }
    // Only the person the issue is assigned to (or an Admin, stepping in) may
    // file the resolution report — mirrors who actually did the work.
    if (req.user.role !== "Admin" && req.user.displayName !== before.assignee) {
      return res.status(403).json({ error: "Only the assignee can submit the resolution report for this issue" });
    }

    const now = new Date().toISOString();
    await client.query(
      `UPDATE issues
          SET resolution_report = $1, resolution_report_at = $2, report_status = 'submitted', updated_at = $2
        WHERE id = $3`,
      [reportText.trim(), now, id]
    );
    await client.query(
      `INSERT INTO activity (id, issue_id, type, text, at, actor)
       VALUES ($1,$2,'report','Submitted a resolution report to the Admin',$3,$4)`,
      [newId("act"), id, now, req.user.displayName]
    );
    await notifyAdmins(client, {
      issueId: id,
      type: "report_submitted",
      message: `${req.user.displayName} submitted a resolution report for ${id} "${before.title}" — ready to review.`,
      excludeUserId: req.user.sub,
    });

    await client.query("COMMIT");
    res.json(await loadIssue(id));
  } catch (err) {
    await client.query("ROLLBACK");
    next(err);
  } finally {
    client.release();
  }
});

/* ------------------------------------------------------------------ */
/*  POST /api/issues/:id/admin-response                                 */
/*  Admin reviews the resolution report, then sends their own message   */
/*  on to the original reporter — this is what finally notifies them    */
/*  that their issue is done, and what was done about it.               */
/*  Body: { message }                                                   */
/* ------------------------------------------------------------------ */
issuesRouter.post("/:id/admin-response", requireRoles("Admin"), async (req, res, next) => {
  const { id } = req.params;
  const { message } = req.body || {};
  if (!message?.trim()) {
    return res.status(400).json({ error: "message is required" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `SELECT title, reporter, assignee, status, resolution_report AS "resolutionReport"
         FROM issues WHERE id = $1 FOR UPDATE`,
      [id]
    );
    const before = rows[0];
    if (!before) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Issue not found" });
    }
    if (!before.resolutionReport) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "There's no resolution report to review yet for this issue" });
    }

    const now = new Date().toISOString();
    await client.query(
      `UPDATE issues
          SET admin_response = $1, admin_response_at = $2, report_status = 'sent', updated_at = $2
        WHERE id = $3`,
      [message.trim(), now, id]
    );
    await client.query(
      `INSERT INTO activity (id, issue_id, type, text, at, actor)
       VALUES ($1,$2,'admin_response','Sent an update to the reporter',$3,$4)`,
      [newId("act"), id, now, req.user.displayName]
    );

    const reporterId = await findUserIdByDisplayName(client, before.reporter);
    await notifyUser(client, {
      recipientId: reporterId,
      issueId: id,
      type: "resolved",
      message: `${id} "${before.title}" has been resolved. ${message.trim()}`,
    });

    await client.query("COMMIT");
    res.json(await loadIssue(id));
  } catch (err) {
    await client.query("ROLLBACK");
    next(err);
  } finally {
    client.release();
  }
});

/* ------------------------------------------------------------------ */
/*  DELETE /api/issues/:id                                             */
/* ------------------------------------------------------------------ */
issuesRouter.delete("/:id", requireRoles("Admin"), async (req, res, next) => {
  try {
    const { rowCount } = await pool.query(`DELETE FROM issues WHERE id = $1`, [req.params.id]);
    if (rowCount === 0) return res.status(404).json({ error: "Issue not found" });
    res.json({ success: true, id: req.params.id });
  } catch (err) {
    next(err);
  }
});

/* ------------------------------------------------------------------ */
/*  POST /api/issues/:id/comments                                      */
/* ------------------------------------------------------------------ */
issuesRouter.post("/:id/comments", async (req, res, next) => {
  const { id } = req.params;
  const { author, text } = req.body || {};
  if (!text?.trim()) return res.status(400).json({ error: "text is required" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const now = new Date().toISOString();
    const exists = await client.query(`SELECT 1 FROM issues WHERE id = $1`, [id]);
    if (exists.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Issue not found" });
    }
    await client.query(
      `INSERT INTO comments (id, issue_id, author, text, at) VALUES ($1,$2,$3,$4,$5)`,
      [newId("cmt"), id, req.user.displayName || author || "Anonymous", text.trim(), now]
    );
    await client.query(
      `INSERT INTO activity (id, issue_id, type, text, at, actor) VALUES ($1,$2,'comment','Comment added',$3,$4)`,
      [newId("act"), id, now, req.user.displayName || author || null]
    );
    await client.query(`UPDATE issues SET updated_at = $1 WHERE id = $2`, [now, id]);
    await client.query("COMMIT");
    res.status(201).json(await loadIssue(id));
  } catch (err) {
    await client.query("ROLLBACK");
    next(err);
  } finally {
    client.release();
  }
});

/* ------------------------------------------------------------------ */
/*  POST /api/issues/:id/attachments — upload a screenshot/log file     */
/*  GET  /api/issues/:id/attachments/:attachmentId — download it        */
/* ------------------------------------------------------------------ */
issuesRouter.post("/:id/attachments", upload.single("file"), async (req, res, next) => {
  const { id } = req.params;
  if (!req.file) return res.status(400).json({ error: "file is required (field name: file)" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const exists = await client.query(`SELECT 1 FROM issues WHERE id = $1`, [id]);
    if (exists.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Issue not found" });
    }
    const now = new Date().toISOString();
    await client.query(
      `INSERT INTO attachments (id, issue_id, filename, mime_type, data, uploaded_by, uploaded_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [newId("att"), id, req.file.originalname, req.file.mimetype, req.file.buffer, req.user.displayName, now]
    );
    await client.query(
      `INSERT INTO activity (id, issue_id, type, text, at, actor) VALUES ($1,$2,'attachment',$3,$4,$5)`,
      [newId("act"), id, `Attached ${req.file.originalname}`, now, req.user.displayName]
    );
    await client.query(`UPDATE issues SET updated_at = $1 WHERE id = $2`, [now, id]);
    await client.query("COMMIT");
    res.status(201).json(await loadIssue(id));
  } catch (err) {
    await client.query("ROLLBACK");
    next(err);
  } finally {
    client.release();
  }
});

issuesRouter.get("/:id/attachments/:attachmentId", async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT filename, mime_type, data FROM attachments WHERE id = $1 AND issue_id = $2`,
      [req.params.attachmentId, req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: "Attachment not found" });
    const file = rows[0];
    res.setHeader("Content-Type", file.mime_type);
    res.setHeader("Content-Disposition", `inline; filename="${file.filename}"`);
    res.send(file.data);
  } catch (err) {
    next(err);
  }
});

/* ------------------------------------------------------------------ */
/*  POST /api/issues/:id/tags                                          */
/* ------------------------------------------------------------------ */
issuesRouter.post("/:id/tags", async (req, res, next) => {
  const { id } = req.params;
  const { tag } = req.body || {};
  if (!tag?.trim()) return res.status(400).json({ error: "tag is required" });
  try {
    const exists = await pool.query(`SELECT 1 FROM issues WHERE id = $1`, [id]);
    if (exists.rowCount === 0) return res.status(404).json({ error: "Issue not found" });
    await pool.query(
      `INSERT INTO issue_tags (issue_id, tag) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
      [id, tag.trim().toLowerCase()]
    );
    res.status(201).json(await loadIssue(id));
  } catch (err) {
    next(err);
  }
});

/* ------------------------------------------------------------------ */
/*  DELETE /api/issues/:id/tags/:tag                                    */
/* ------------------------------------------------------------------ */
issuesRouter.delete("/:id/tags/:tag", async (req, res, next) => {
  const { id, tag } = req.params;
  try {
    await pool.query(`DELETE FROM issue_tags WHERE issue_id = $1 AND tag = $2`, [id, tag]);
    const issue = await loadIssue(id);
    if (!issue) return res.status(404).json({ error: "Issue not found" });
    res.json(issue);
  } catch (err) {
    next(err);
  }
});
