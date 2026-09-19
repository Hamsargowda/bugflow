import { Router } from "express";
import { pool } from "../db.js";
import { requireAuth } from "../auth.js";

export const notificationsRouter = Router();
notificationsRouter.use(requireAuth);

/* ------------------------------------------------------------------ */
/*  GET /api/notifications — persisted notifications for the signed-in  */
/*  user, plus "virtual" overdue reminders computed on the fly for any   */
/*  issue assigned to them whose due date has passed and isn't done yet. */
/* ------------------------------------------------------------------ */
notificationsRouter.get("/", async (req, res, next) => {
  try {
    const { rows: stored } = await pool.query(
      `SELECT n.id, n.issue_id AS "issueId", i.title AS "issueTitle", n.type, n.message, n.read, n.created_at AS "createdAt"
         FROM notifications n
         LEFT JOIN issues i ON i.id = n.issue_id
        WHERE n.recipient_id = $1
        ORDER BY n.created_at DESC
        LIMIT 50`,
      [req.user.sub]
    );

    const { rows: overdue } = await pool.query(
      `SELECT id, title, due_date AS "dueDate"
         FROM issues
        WHERE assignee = $1
          AND due_date IS NOT NULL
          AND due_date < CURRENT_DATE
          AND status NOT IN ('Resolved', 'Closed')`,
      [req.user.displayName]
    );
    const virtual = overdue.map((i) => ({
      id: `virtual_overdue_${i.id}`,
      issueId: i.id,
      issueTitle: i.title,
      type: "overdue",
      message: `${i.id} is overdue — it was due ${new Date(i.dueDate).toLocaleDateString()}`,
      read: false,
      createdAt: i.dueDate,
    }));

    res.json([...virtual, ...stored]);
  } catch (err) {
    next(err);
  }
});

/* PATCH /api/notifications/:id/read — mark one notification read (ignores virtual ids) */
notificationsRouter.patch("/:id/read", async (req, res, next) => {
  const { id } = req.params;
  if (id.startsWith("virtual_")) return res.json({ success: true });
  try {
    await pool.query(`UPDATE notifications SET read = TRUE WHERE id = $1 AND recipient_id = $2`, [id, req.user.sub]);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

/* POST /api/notifications/read-all — mark every stored notification read for this user */
notificationsRouter.post("/read-all", async (req, res, next) => {
  try {
    await pool.query(`UPDATE notifications SET read = TRUE WHERE recipient_id = $1 AND read = FALSE`, [req.user.sub]);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});
