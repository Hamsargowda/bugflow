import { Router } from "express";
import bcrypt from "bcryptjs";
import { pool } from "../db.js";
import { requireAuth, signToken } from "../auth.js";

export const authRouter = Router();

function publicUser(row) {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    role: row.role,
  };
}

authRouter.post("/login", async (req, res, next) => {
  const { username, password } = req.body || {};
  if (!username?.trim() || !password) {
    return res.status(400).json({ error: "Username and password are required" });
  }

  try {
    const { rows } = await pool.query(
      `SELECT id, username, display_name, role, password_hash FROM users WHERE username = $1 AND active = TRUE`,
      [username.trim().toLowerCase()]
    );
    const user = rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: "Invalid username or password" });
    }
    const token = signToken(user);
    res.json({ token, user: publicUser(user) });
  } catch (err) {
    next(err);
  }
});

authRouter.get("/me", requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, username, display_name, role FROM users WHERE id = $1 AND active = TRUE`,
      [req.user.sub]
    );
    if (!rows[0]) return res.status(401).json({ error: "User not found" });
    res.json({ user: publicUser(rows[0]) });
  } catch (err) {
    next(err);
  }
});
