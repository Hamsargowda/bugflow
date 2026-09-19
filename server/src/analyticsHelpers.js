/* ---------------------------------------------------------------------- */
/*  Milestone 4 — Optimization & Finalization                              */
/*  Pure calculation helpers for the analytics endpoints. Kept free of any  */
/*  database access so they can be unit-tested directly.                   */
/* ---------------------------------------------------------------------- */

/* A developer's declared skills (from users.core_skills) map to a display
   "team" for the workload matrix. First matching skill wins. */
const TEAM_BY_SKILL = {
  PostgreSQL: "Backend Engineering",
  Database: "Backend Engineering",
  Backend: "Backend Engineering",
  Python: "Backend Engineering",
  Security: "Platform & API",
  Authentication: "Platform & API",
  API: "Platform & API",
  React: "Frontend UI",
  Frontend: "Frontend UI",
  CSS: "Frontend UI",
  Mobile: "Mobile Apps",
  Sync: "Mobile Apps",
};

export function deriveTeam(skills = []) {
  for (const skill of skills) {
    if (TEAM_BY_SKILL[skill]) return TEAM_BY_SKILL[skill];
  }
  return "Unassigned";
}

export function roundToOneDecimal(n) {
  return Math.round(n * 10) / 10;
}

/**
 * Average Mean-Time-To-Resolution, in hours, from a list of raw
 * (resolvedAt - createdAt) durations in milliseconds. Returns null when
 * there's nothing resolved yet rather than NaN/0, so the UI can render
 * "—" instead of a misleading zero.
 *
 * The production endpoint computes this same average inside a single SQL
 * `AVG(EXTRACT(EPOCH FROM ...))` query for speed at 50,000+ rows — this
 * helper mirrors that formula so the math itself is covered by a fast,
 * DB-free test.
 */
export function computeMttrHours(durationsMs = []) {
  if (!durationsMs.length) return null;
  const avgMs = durationsMs.reduce((sum, v) => sum + v, 0) / durationsMs.length;
  return roundToOneDecimal(avgMs / 3_600_000);
}

/**
 * Backlog Health Score (0-100): 100 minus the share of still-open issues
 * that have gone stale (older than `staleDays` with no resolution).
 * An empty backlog scores a perfect 100 rather than dividing by zero.
 */
export function computeBacklogHealthScore({ totalOpen, staleOpen }) {
  if (!totalOpen) return 100;
  const staleRatio = staleOpen / totalOpen;
  return Math.max(0, Math.round(100 - staleRatio * 100));
}

/**
 * Defect Leakage Rate (%): of everything that shipped as fixed, what
 * share were caught in Production rather than Staging/Development. This
 * is a proxy metric (BugFlow doesn't track a separate "escaped to prod"
 * flag), so it reads "% of fixes whose environment was Production".
 */
export function computeDefectLeakageRate({ productionResolved, totalResolved }) {
  if (!totalResolved) return 0;
  return roundToOneDecimal((productionResolved / totalResolved) * 100);
}

export function computeBugFixRate({ resolvedClosed, total }) {
  if (!total) return 0;
  return roundToOneDecimal((resolvedClosed / total) * 100);
}
