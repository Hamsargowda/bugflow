import "dotenv/config";
import express from "express";
import cors from "cors";
import swaggerUi from "swagger-ui-express";
import { pool } from "./db.js";
import { issuesRouter } from "./routes/issues.js";
import { authRouter } from "./routes/auth.js";
import { usersRouter } from "./routes/users.js";
import { sprintsRouter } from "./routes/sprints.js";
import { activityRouter } from "./routes/activity.js";
import { notificationsRouter } from "./routes/notifications.js";
import { analyticsRouter } from "./routes/analytics.js";
import { openapiSpec } from "./openapi.js";
import { recordResponseTime } from "./perf.js";
import { devopsDashboardRouter } from "./routes/devopsDashboard.js";

export const app = express();

app.use(cors());
app.use(express.json());

// Milestone 4: track response times for the system-performance KPI.
// Runs on every request, adds negligible overhead, and needs no external
// metrics service.
app.use((req, res, next) => {
  const start = process.hrtime.bigint();
  res.on("finish", () => {
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    recordResponseTime(ms);
  });
  next();
});

// Liveness check — no database dependency, so it stays green even if
// Postgres is briefly unreachable (used by the Docker Compose healthcheck).
app.get("/health", (req, res) => {
  res.json({ status: "healthy", database: "postgresql" });
});

// Readiness check — actually confirms the DB connection works.
app.get("/api/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ ok: true, db: "connected" });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Interactive API docs (Swagger UI), same idea as FastAPI's /docs
app.get("/openapi.json", (req, res) => res.json(openapiSpec));
app.use("/docs", swaggerUi.serve, swaggerUi.setup(openapiSpec, {
  customSiteTitle: "BugFlow - Software Issue Tracking & Resolution Platform",
}));

app.use("/api/auth", authRouter);
app.use("/api/users", usersRouter);
app.use("/api/issues", issuesRouter);
app.use("/api/sprints", sprintsRouter);
app.use("/api/activity", activityRouter);
app.use("/api/notifications", notificationsRouter);
app.use("/api/analytics", analyticsRouter);
// Module 3 CI/CD, quality metrics, Plotly configs, and PDF/CSV exports.
app.use("/api/v1", devopsDashboardRouter);

// Fallback error handler
app.use((err, req, res, next) => {
  console.error(err);
  const status = err.name === "MulterError" || /only \.png|jpg|log/i.test(err.message || "") ? 400 : 500;
  res.status(status).json({ error: err.message || "Internal server error" });
});
