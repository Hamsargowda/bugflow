import { Router } from "express";
import { pool } from "../db.js";
import { requireAuth, requireRoles } from "../auth.js";

export const sprintsRouter = Router();
sprintsRouter.use(requireAuth);

function newId(prefix) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** Pure helper (Milestone 4 test coverage): % of a sprint's issues that are done. */
export function computeCompletionPct(total, completed) {
  if (!total) return 0;
  return Math.round((completed / total) * 100);
}

/**
 * Pure helper (Milestone 4 test coverage): velocity freezes exactly once,
 * the moment a sprint's status transitions *into* COMPLETED for the first
 * time. Re-completing, or any other transition, must never touch it again.
 */
export function shouldFreezeVelocity({ currentStatus, currentVelocity, newStatus }) {
  return newStatus === "COMPLETED" && currentStatus !== "COMPLETED" && currentVelocity === null;
}

async function loadSprintsWithMetrics() {
  const { rows: sprints } = await pool.query(
    `SELECT id, name, goal, start_date AS "startDate", end_date AS "endDate", status, velocity, created_at AS "createdAt"
       FROM sprints ORDER BY created_at DESC`
  );
  if (sprints.length === 0) return [];

  const ids = sprints.map((s) => s.id);
  const { rows: counts } = await pool.query(
    `SELECT sprint_id,
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE status IN ('Resolved','Closed'))::int AS completed
       FROM issues
      WHERE sprint_id = ANY($1)
      GROUP BY sprint_id`,
    [ids]
  );
  const byId = Object.fromEntries(counts.map((c) => [c.sprint_id, c]));

  return sprints.map((s) => {
    const c = byId[s.id] || { total: 0, completed: 0 };
    return {
      ...s,
      issuesCount: c.total,
      completedCount: c.completed,
      completionPct: computeCompletionPct(c.total, c.completed),
    };
  });
}

/* GET /api/sprints — list all sprints with live issue counts/completion */
sprintsRouter.get("/", async (req, res, next) => {
  try {
    res.json(await loadSprintsWithMetrics());
  } catch (err) {
    next(err);
  }
});

/* GET /api/sprints/backlog — issues not assigned to any sprint (excluding Closed) */
sprintsRouter.get("/backlog", async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, title, severity, priority, priority_score AS "priorityScore", status, assignee, module
         FROM issues WHERE sprint_id IS NULL AND status <> 'Closed'
        ORDER BY priority_score DESC NULLS LAST, created_at DESC`
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

/* POST /api/sprints — create a new sprint container (Admin, Project Manager) */
sprintsRouter.post("/", requireRoles("Admin", "Project Manager"), async (req, res, next) => {
  const { name, goal, startDate, endDate } = req.body || {};
  if (!name?.trim()) return res.status(400).json({ error: "name is required" });
  try {
    const id = newId("SPRINT");
    await pool.query(
      `INSERT INTO sprints (id, name, goal, start_date, end_date, status) VALUES ($1,$2,$3,$4,$5,'PLANNING')`,
      [id, name.trim(), goal || null, startDate || null, endDate || null]
    );
    res.status(201).json((await loadSprintsWithMetrics()).find((s) => s.id === id));
  } catch (err) {
    next(err);
  }
});

/* PATCH /api/sprints/:id — update status/name/goal/dates (Admin, Project Manager).
   Freezes `velocity` the moment status transitions to COMPLETED. */
sprintsRouter.patch("/:id", requireRoles("Admin", "Project Manager"), async (req, res, next) => {
  const { id } = req.params;
  const { name, goal, startDate, endDate, status } = req.body || {};

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(`SELECT * FROM sprints WHERE id = $1`, [id]);
    if (rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Sprint not found" });
    }
    const current = rows[0];

    const sets = [];
    const values = [];
    let i = 1;
    if (name !== undefined) { sets.push(`name = $${i++}`); values.push(name); }
    if (goal !== undefined) { sets.push(`goal = $${i++}`); values.push(goal); }
    if (startDate !== undefined) { sets.push(`start_date = $${i++}`); values.push(startDate); }
    if (endDate !== undefined) { sets.push(`end_date = $${i++}`); values.push(endDate); }
    if (status !== undefined) { sets.push(`status = $${i++}`); values.push(status); }

    // Freeze velocity exactly once, the moment the sprint becomes COMPLETED.
    if (status !== undefined && shouldFreezeVelocity({ currentStatus: current.status, currentVelocity: current.velocity, newStatus: status })) {
      const { rows: countRows } = await client.query(
        `SELECT COUNT(*) FILTER (WHERE status IN ('Resolved','Closed'))::int AS completed
           FROM issues WHERE sprint_id = $1`,
        [id]
      );
      sets.push(`velocity = $${i++}`);
      values.push(countRows[0].completed);
    }

    if (sets.length > 0) {
      values.push(id);
      await client.query(`UPDATE sprints SET ${sets.join(", ")} WHERE id = $${i}`, values);
    }

    await client.query("COMMIT");
    res.json((await loadSprintsWithMetrics()).find((s) => s.id === id));
  } catch (err) {
    await client.query("ROLLBACK");
    next(err);
  } finally {
    client.release();
  }
});

/* POST /api/sprints/:id/add-issue/:issueId — move a bug from Backlog into this Sprint
   (Admin, Project Manager) */
sprintsRouter.post("/:id/add-issue/:issueId", requireRoles("Admin", "Project Manager"), async (req, res, next) => {
  const { id, issueId } = req.params;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const sprint = await client.query(`SELECT name FROM sprints WHERE id = $1`, [id]);
    if (sprint.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Sprint not found" });
    }
    const { rowCount } = await client.query(
      `UPDATE issues SET sprint_id = $1, updated_at = now() WHERE id = $2`,
      [id, issueId]
    );
    if (rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Issue not found" });
    }
    await client.query(
      `INSERT INTO activity (id, issue_id, type, text, at, actor) VALUES ($1,$2,'sprint',$3,now(),$4)`,
      [newId("act"), issueId, `Added to sprint "${sprint.rows[0].name}"`, req.user.displayName]
    );
    await client.query("COMMIT");
    res.json({ success: true });
  } catch (err) {
    await client.query("ROLLBACK");
    next(err);
  } finally {
    client.release();
  }
});

/* DELETE /api/sprints/:id/remove-issue/:issueId — move a bug back to the Backlog */
sprintsRouter.delete("/:id/remove-issue/:issueId", requireRoles("Admin", "Project Manager"), async (req, res, next) => {
  const { id, issueId } = req.params;
  try {
    const { rowCount } = await pool.query(
      `UPDATE issues SET sprint_id = NULL, updated_at = now() WHERE id = $1 AND sprint_id = $2`,
      [issueId, id]
    );
    if (rowCount === 0) return res.status(404).json({ error: "Issue not found in this sprint" });
    await pool.query(
      `INSERT INTO activity (id, issue_id, type, text, at, actor) VALUES ($1,$2,'sprint','Moved back to Backlog',now(),$3)`,
      [newId("act"), issueId, req.user.displayName]
    );
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});
