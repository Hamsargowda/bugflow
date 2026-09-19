import { pool } from "./db.js";

/* ------------------------------------------------------------------ */
/*  Git commit message parsing                                         */
/*                                                                       */
/*  Recognises "fixes #2", "closes #5", "resolves #8" (case-insensitive) */
/*  as well as the project's real BUG-#### id format ("fixes BUG-1005", */
/*  "fixes #BUG-1005"). A bare number is expanded to BUG-<n> so the      */
/*  webhook works whether the commit references the short form the      */
/*  spec describes or the id BugFlow actually assigns.                  */
/* ------------------------------------------------------------------ */
const COMMIT_KEYWORD_RE = /\b(fixes|closes|resolves)\s*:?\s*#?\s*(bug-)?(\d+)\b/gi;

export function extractBugReferences(message) {
  const refs = [];
  const seen = new Set();
  let match;
  COMMIT_KEYWORD_RE.lastIndex = 0;
  while ((match = COMMIT_KEYWORD_RE.exec(message || "")) !== null) {
    const [, keyword, , number] = match;
    const id = `BUG-${number}`;
    if (seen.has(id)) continue;
    seen.add(id);
    refs.push({ keyword: keyword.toLowerCase(), issueId: id });
  }
  return refs;
}

/* ------------------------------------------------------------------ */
/*  Quality Scorecard metrics                                           */
/* ------------------------------------------------------------------ */

/** Fix Rate % = (Resolved + Closed) / Total * 100 */
export async function computeFixRate() {
  const { rows } = await pool.query(
    `SELECT
       COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE status IN ('Resolved', 'Closed'))::int AS fixed
     FROM issues`
  );
  const { total, fixed } = rows[0];
  return total === 0 ? 0 : Number(((fixed / total) * 100).toFixed(2));
}

/** MTTR (hours) = average time between created_at and resolved_at for resolved/closed issues. */
export async function computeMTTRHours() {
  const { rows } = await pool.query(
    `SELECT AVG(EXTRACT(EPOCH FROM (resolved_at - created_at)) / 3600.0) AS avg_hours
     FROM issues
     WHERE resolved_at IS NOT NULL`
  );
  const avg = rows[0].avg_hours;
  return avg === null ? 0 : Number(Number(avg).toFixed(2));
}

/** Defect Leakage Rate % = bugs found in Production / total. */
export async function computeLeakageRate() {
  const { rows } = await pool.query(
    `SELECT
       COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE environment = 'Production')::int AS leaked
     FROM issues`
  );
  const { total, leaked } = rows[0];
  return total === 0 ? 0 : Number(((leaked / total) * 100).toFixed(2));
}

/**
 * Backlog Health Score (0-100). Starts at 100 and loses points for every
 * still-open Critical bug (heaviest penalty) and, more lightly, every
 * still-open High severity bug. Never drops below 0.
 */
export async function computeBacklogHealthScore() {
  const { rows } = await pool.query(
    `SELECT severity, COUNT(*)::int AS n
       FROM issues
      WHERE status NOT IN ('Resolved', 'Closed')
      GROUP BY severity`
  );
  const openBySeverity = Object.fromEntries(rows.map((r) => [r.severity, r.n]));
  const openCritical = openBySeverity.Critical || 0;
  const openHigh = openBySeverity.High || 0;

  const CRITICAL_PENALTY = 12;
  const HIGH_PENALTY = 4;
  const score = 100 - openCritical * CRITICAL_PENALTY - openHigh * HIGH_PENALTY;
  return Math.max(0, Math.min(100, score));
}

export async function computeQualityMetrics() {
  const [fixRatePercentage, mttrHours, leakageRatePercentage, healthScore] = await Promise.all([
    computeFixRate(),
    computeMTTRHours(),
    computeLeakageRate(),
    computeBacklogHealthScore(),
  ]);
  return {
    fixRatePercentage,
    meanTimeToResolutionHours: mttrHours,
    defectLeakageRatePercentage: leakageRatePercentage,
    backlogHealthScore: healthScore,
    readyForRelease: healthScore >= 90,
    generatedAt: new Date().toISOString(),
  };
}

/* ------------------------------------------------------------------ */
/*  Defect trend (last 14 days)                                         */
/* ------------------------------------------------------------------ */
export async function computeDefectTrends(days = 14) {
  const { rows: createdRows } = await pool.query(
    `SELECT to_char(created_at::date, 'YYYY-MM-DD') AS day, COUNT(*)::int AS n
       FROM issues
      WHERE created_at >= now() - ($1 || ' days')::interval
      GROUP BY 1`,
    [days]
  );
  const { rows: resolvedRows } = await pool.query(
    `SELECT to_char(resolved_at::date, 'YYYY-MM-DD') AS day, COUNT(*)::int AS n
       FROM issues
      WHERE resolved_at IS NOT NULL AND resolved_at >= now() - ($1 || ' days')::interval
      GROUP BY 1`,
    [days]
  );
  const createdByDay = Object.fromEntries(createdRows.map((r) => [r.day, r.n]));
  const resolvedByDay = Object.fromEntries(resolvedRows.map((r) => [r.day, r.n]));

  const series = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i);
    const day = d.toISOString().slice(0, 10);
    series.push({
      day,
      reported: createdByDay[day] || 0,
      resolved: resolvedByDay[day] || 0,
    });
  }
  return series;
}

/* ------------------------------------------------------------------ */
/*  Workflow pipeline (issue counts per status)                         */
/* ------------------------------------------------------------------ */
export async function computeWorkflowPipeline() {
  const { rows } = await pool.query(
    `SELECT status, COUNT(*)::int AS n FROM issues GROUP BY status`
  );
  return Object.fromEntries(rows.map((r) => [r.status, r.n]));
}

/* ------------------------------------------------------------------ */
/*  Severity breakdown                                                  */
/* ------------------------------------------------------------------ */
export async function computeSeverityBreakdown() {
  const { rows } = await pool.query(
    `SELECT severity, COUNT(*)::int AS n FROM issues GROUP BY severity`
  );
  return Object.fromEntries(rows.map((r) => [r.severity, r.n]));
}
