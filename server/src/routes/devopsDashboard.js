import { Router } from "express";
import PDFDocument from "pdfkit";
import { pool } from "../db.js";
import { requireAuth } from "../auth.js";
import { loadIssue } from "../issueLoader.js";
import {
  extractBugReferences,
  computeQualityMetrics,
  computeDefectTrends,
  computeWorkflowPipeline,
  computeSeverityBreakdown,
} from "../quality.js";

export const devopsDashboardRouter = Router();

function newId(prefix) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/* ------------------------------------------------------------------ */
/*  POST /api/v1/webhooks/git                                          */
/*  Public endpoint — a CI/CD pipeline or Git host calls this directly, */
/*  it doesn't carry a logged-in user's session token.                  */
/*  Body: { message: string, commitHash?: string }                      */
/* ------------------------------------------------------------------ */
devopsDashboardRouter.post("/webhooks/git", async (req, res, next) => {
  const { message, commitHash } = req.body || {};
  if (!message?.trim()) {
    return res.status(400).json({ error: "message is required" });
  }

  const refs = extractBugReferences(message);
  if (refs.length === 0) {
    return res.json({ matched: [], transitioned: [], note: "No 'fixes #n' / 'closes #n' / 'resolves #n' reference found in the commit message." });
  }

  const shortHash = (commitHash || newId("").replace("_", "")).toString().slice(0, 7);
  const transitioned = [];
  const skipped = [];

  for (const ref of refs) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const { rows } = await client.query(`SELECT id, status FROM issues WHERE id = $1 FOR UPDATE`, [ref.issueId]);
      const issue = rows[0];
      if (!issue) {
        await client.query("ROLLBACK");
        skipped.push({ ...ref, reason: "Issue not found" });
        continue;
      }
      if (["Resolved", "Closed"].includes(issue.status)) {
        await client.query("ROLLBACK");
        skipped.push({ ...ref, reason: `Already ${issue.status}` });
        continue;
      }

      const now = new Date().toISOString();
      await client.query(
        `UPDATE issues SET status = 'QA Verification', updated_at = $1 WHERE id = $2`,
        [now, ref.issueId]
      );
      await client.query(
        `INSERT INTO activity (id, issue_id, type, text, old_value, new_value, at, actor)
         VALUES ($1,$2,'ci_cd','Auto-transitioned by Git commit #${shortHash}',$3,$4,$5,'CI/CD Bot')`,
        [newId("act"), ref.issueId, issue.status, "QA Verification", now]
      );
      await client.query("COMMIT");
      transitioned.push({ ...ref, from: issue.status, to: "QA Verification" });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  res.json({ commitHash: shortHash, matched: refs, transitioned, skipped });
});

/* ------------------------------------------------------------------ */
/*  GET /api/v1/analytics/quality-metrics                               */
/* ------------------------------------------------------------------ */
devopsDashboardRouter.get("/analytics/quality-metrics", requireAuth, async (req, res, next) => {
  try {
    res.json(await computeQualityMetrics());
  } catch (err) {
    next(err);
  }
});

/* ------------------------------------------------------------------ */
/*  GET /api/v1/analytics/defect-trends                                 */
/* ------------------------------------------------------------------ */
devopsDashboardRouter.get("/analytics/defect-trends", requireAuth, async (req, res, next) => {
  try {
    res.json(await computeDefectTrends(14));
  } catch (err) {
    next(err);
  }
});

/* ------------------------------------------------------------------ */
/*  GET /api/v1/analytics/plotly-charts                                 */
/*  Ready-to-render Plotly.js trace + layout configs for the three       */
/*  Milestone 3 charts.                                                  */
/* ------------------------------------------------------------------ */
devopsDashboardRouter.get("/analytics/plotly-charts", requireAuth, async (req, res, next) => {
  try {
    const [trend, severity, pipeline] = await Promise.all([
      computeDefectTrends(14),
      computeSeverityBreakdown(),
      computeWorkflowPipeline(),
    ]);

    const defectTrend = {
      data: [
        {
          x: trend.map((d) => d.day),
          y: trend.map((d) => d.reported),
          type: "scatter",
          mode: "lines+markers",
          name: "New bugs reported",
          line: { color: "#e11d48" },
        },
        {
          x: trend.map((d) => d.day),
          y: trend.map((d) => d.resolved),
          type: "scatter",
          mode: "lines+markers",
          name: "Bugs resolved",
          line: { color: "#16a34a" },
        },
      ],
      layout: {
        title: "Defect Trend — Last 14 Days",
        margin: { t: 40, r: 20, l: 40, b: 40 },
        legend: { orientation: "h" },
      },
    };

    const severityOrder = ["Critical", "High", "Medium", "Low"];
    const severityColors = { Critical: "#e11d48", High: "#f97316", Medium: "#f59e0b", Low: "#10b981" };
    const severityDonut = {
      data: [
        {
          labels: severityOrder,
          values: severityOrder.map((s) => severity[s] || 0),
          type: "pie",
          hole: 0.55,
          marker: { colors: severityOrder.map((s) => severityColors[s]) },
        },
      ],
      layout: { title: "Bugs by Severity", margin: { t: 40, r: 20, l: 20, b: 20 } },
    };

    const stageOrder = ["Open", "Triaged", "In Progress", "In Review", "QA Verification", "Resolved", "Closed"];
    const workflowBar = {
      data: [
        {
          x: stageOrder,
          y: stageOrder.map((s) => pipeline[s] || 0),
          type: "bar",
          marker: { color: "#7c3aed" },
        },
      ],
      layout: { title: "Workflow Pipeline", margin: { t: 40, r: 20, l: 40, b: 60 } },
    };

    res.json({ defectTrend, severityDonut, workflowBar });
  } catch (err) {
    next(err);
  }
});

/* ------------------------------------------------------------------ */
/*  GET /api/v1/export/csv                                              */
/* ------------------------------------------------------------------ */
devopsDashboardRouter.get("/export/csv", requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, project, title, severity, priority, module, environment, category,
              reporter, assignee, status, created_at, updated_at, resolved_at
         FROM issues ORDER BY created_at DESC`
    );

    const headers = [
      "id", "project", "title", "severity", "priority", "module", "environment",
      "category", "reporter", "assignee", "status", "created_at", "updated_at", "resolved_at",
    ];
    const escapeCsv = (val) => {
      if (val === null || val === undefined) return "";
      const s = String(val);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [headers.join(",")];
    for (const row of rows) {
      lines.push(headers.map((h) => escapeCsv(row[h])).join(","));
    }
    const csv = lines.join("\r\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="bugflow-registry-${Date.now()}.csv"`);
    res.send(csv);
  } catch (err) {
    next(err);
  }
});

/* ------------------------------------------------------------------ */
/*  GET /api/v1/export/pdf                                              */
/* ------------------------------------------------------------------ */
devopsDashboardRouter.get("/export/pdf", requireAuth, async (req, res, next) => {
  try {
    const metrics = await computeQualityMetrics();
    const { rows: criticalRows } = await pool.query(
      `SELECT id, title, module, status, created_at
         FROM issues
        WHERE severity = 'Critical' AND status NOT IN ('Resolved', 'Closed')
        ORDER BY created_at DESC
        LIMIT 10`
    );
    const { rows: countRows } = await pool.query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE severity = 'Critical')::int AS critical,
         COUNT(*) FILTER (WHERE severity = 'High')::int AS high,
         COUNT(*) FILTER (WHERE severity = 'Medium')::int AS medium,
         COUNT(*) FILTER (WHERE severity = 'Low')::int AS low
       FROM issues`
    );
    const counts = countRows[0];

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="bugflow-quality-report-${Date.now()}.pdf"`);

    const doc = new PDFDocument({ margin: 50 });
    doc.pipe(res);

    doc.fontSize(20).text("BugFlow — Software Quality Report", { align: "center" });
    doc.moveDown(0.3);
    doc.fontSize(10).fillColor("#666").text(`Generated ${new Date().toLocaleString()}`, { align: "center" });
    doc.fillColor("#000");
    doc.moveDown(1.5);

    doc.fontSize(14).text("Executive Summary");
    doc.moveDown(0.5);
    const summaryRows = [
      ["Fix Rate", `${metrics.fixRatePercentage}%`],
      ["Mean Time to Resolution", `${metrics.meanTimeToResolutionHours} hours`],
      ["Defect Leakage Rate", `${metrics.defectLeakageRatePercentage}%`],
      ["Backlog Health Score", `${metrics.backlogHealthScore} / 100`],
      ["Ready for release (score ≥ 90)", metrics.readyForRelease ? "Yes" : "No"],
    ];
    doc.fontSize(11);
    for (const [label, value] of summaryRows) {
      doc.text(`${label}:  `, { continued: true }).font("Helvetica-Bold").text(value).font("Helvetica");
    }
    doc.moveDown(1);

    doc.fontSize(14).text("Defect Counts");
    doc.moveDown(0.5);
    doc.fontSize(11);
    doc.text(`Total bugs: ${counts.total}`);
    doc.text(`Critical: ${counts.critical}    High: ${counts.high}    Medium: ${counts.medium}    Low: ${counts.low}`);
    doc.moveDown(1);

    doc.fontSize(14).text("Recent Critical Bugs (open)");
    doc.moveDown(0.5);
    if (criticalRows.length === 0) {
      doc.fontSize(11).fillColor("#666").text("None — nice work!").fillColor("#000");
    } else {
      doc.fontSize(10);
      for (const b of criticalRows) {
        doc.font("Helvetica-Bold").text(`${b.id}`, { continued: true }).font("Helvetica")
          .text(`  ${b.title}  ·  ${b.module}  ·  ${b.status}  ·  ${new Date(b.created_at).toLocaleDateString()}`);
      }
    }

    doc.end();
  } catch (err) {
    next(err);
  }
});
