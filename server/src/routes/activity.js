import { Router } from "express";
import { pool } from "../db.js";
import { requireAuth } from "../auth.js";

export const activityRouter = Router();
activityRouter.use(requireAuth);

/* GET /api/activity/recent?limit=20 — latest activity entries across every issue,
   for the Milestone 2 "Live Activity Stream" feed. */
activityRouter.get("/recent", async (req, res, next) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
  try {
    const { rows } = await pool.query(
      `SELECT a.id, a.issue_id AS "issueId", i.title AS "issueTitle", a.type, a.text,
              a.old_value AS "oldValue", a.new_value AS "newValue", a.at, a.actor
         FROM activity a
         JOIN issues i ON i.id = a.issue_id
        ORDER BY a.at DESC
        LIMIT $1`,
      [limit]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});
