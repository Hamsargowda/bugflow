import { Router } from "express";
import { pool } from "../db.js";
import { requireAuth } from "../auth.js";

export const usersRouter = Router();

/*
 * GET /api/users — list every active user (any role) so the Admin-only
 * "assign issue" control can offer real accounts instead of a hardcoded name list.
 * Any authenticated user can read this list (needed just to display an assignee's
 * name); only Admins can actually change an assignment (enforced in routes/issues.js).
 */
usersRouter.get("/", requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, username, display_name AS "displayName", role
         FROM users
        WHERE active = TRUE
        ORDER BY display_name ASC`
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});
