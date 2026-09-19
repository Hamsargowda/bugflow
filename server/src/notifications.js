import { pool } from "./db.js";

function newId(prefix) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** Look up a user's id from their display name (issues store reporter/assignee as display names). */
export async function findUserIdByDisplayName(client, displayName) {
  if (!displayName || displayName === "Unassigned") return null;
  const { rows } = await client.query(
    `SELECT id FROM users WHERE display_name = $1 AND active = TRUE LIMIT 1`,
    [displayName]
  );
  return rows[0]?.id || null;
}

/** Insert one notification for a single recipient. No-op if recipientId is falsy. */
export async function notifyUser(client, { recipientId, issueId, type, message }) {
  if (!recipientId) return;
  await client.query(
    `INSERT INTO notifications (id, recipient_id, issue_id, type, message) VALUES ($1,$2,$3,$4,$5)`,
    [newId("ntf"), recipientId, issueId || null, type, message]
  );
}

/** Insert the same notification for every active Admin (optionally skipping one user id). */
export async function notifyAdmins(client, { issueId, type, message, excludeUserId }) {
  const { rows } = await client.query(
    `SELECT id FROM users WHERE role = 'Admin' AND active = TRUE`
  );
  for (const admin of rows) {
    if (excludeUserId && admin.id === excludeUserId) continue;
    await notifyUser(client, { recipientId: admin.id, issueId, type, message });
  }
}
