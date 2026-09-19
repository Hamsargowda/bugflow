/* ---------------------------------------------------------------------- */
/*  Part 1 — Smart Priority Calculator                                    */
/*  Priority Score = Severity Weight × Category Urgency Weight            */
/* ---------------------------------------------------------------------- */

const SEVERITY_WEIGHTS = {
  Critical: 4, // CRITICAL
  High: 3,     // MAJOR
  Medium: 2,   // MINOR
  Low: 1,      // TRIVIAL
};

const CATEGORY_URGENCY = {
  "Security Vulnerability": 3, // High urgency
  "Database Error": 3,        // High urgency
  "API Gateway": 2,           // Medium urgency
  "Backend Logic": 2,         // Medium urgency
  "UI Glitch": 1,             // Low urgency
};

export function computePriorityScore(severity, category) {
  const sw = SEVERITY_WEIGHTS[severity] ?? 1;
  const cw = CATEGORY_URGENCY[category] ?? 1;
  return sw * cw;
}

export function priorityLabelForScore(score) {
  if (score >= 10) return { label: "URGENT", display: "P0 - Urgent" };
  if (score >= 7) return { label: "HIGH", display: "P1 - High" };
  if (score >= 4) return { label: "MEDIUM", display: "P2 - Medium" };
  return { label: "LOW", display: "P3 - Low" };
}

/* ---------------------------------------------------------------------- */
/*  Part 2 — Smart Developer Matcher                                      */
/* ---------------------------------------------------------------------- */

/* Maps a developer's declared skill to the keywords in a bug report that
   count as evidence of relevance for that skill. */
const SKILL_KEYWORDS = {
  PostgreSQL: ["database", "sql", "postgres", "query", "migration", "schema"],
  Database: ["database", "sql", "data loss", "sync", "query"],
  Backend: ["api", "server", "backend", "endpoint", "500", "exception", "gateway"],
  Python: ["python", "script", "backend"],
  API: ["api", "endpoint", "gateway", "rest", "webhook", "500", "malformed"],
  Security: ["security", "auth", "login", "breach", "vulnerability", "token", "password", "permission"],
  Authentication: ["auth", "login", "signin", "sign-in", "session", "token", "password"],
  React: ["ui", "frontend", "component", "render", "button", "dropdown", "widget", "dashboard"],
  Frontend: ["ui", "frontend", "css", "layout", "align", "responsive", "dashboard", "widget"],
  CSS: ["css", "style", "layout", "align", "spacing", "cosmetic", "responsive"],
  Mobile: ["android", "ios", "mobile", "app crash", "notification", "push"],
  Sync: ["sync", "offline", "data loss", "conflict"],
};

/*
 * recommendDevelopers(text, developers, openCountsById)
 * - text: title + description of the bug (already lowercase-safe, we lowercase internally)
 * - developers: [{ id, displayName, coreSkills: string[] }]
 * - openCountsById: { [developerId]: number }  -- current open/active issue count
 * Returns the top 3 as [{ id, displayName, matchPercent, reason }]
 */
export function recommendDevelopers(text, developers, openCountsById = {}) {
  const t = (text || "").toLowerCase();

  const scored = developers.map((dev) => {
    const skills = dev.coreSkills || [];
    const matched = skills.filter((skill) => {
      const keywords = SKILL_KEYWORDS[skill] || [skill.toLowerCase()];
      return keywords.some((k) => t.includes(k));
    });

    const skillRatio = skills.length ? matched.length / skills.length : 0;
    const openCount = openCountsById[dev.id] || 0;
    const workloadFactor = Math.max(1 - Math.min(openCount * 0.12, 0.5), 0.5);

    // Baseline score even with no keyword hit, so lightly-loaded developers
    // still surface instead of returning an all-zero list.
    const base = skillRatio > 0 ? skillRatio * 100 : 20;
    const matchPercent = Math.round(base * workloadFactor);

    const reason =
      matched.length > 0
        ? `${matched.join(", ")} match · ${openCount} active task${openCount === 1 ? "" : "s"}`
        : `No direct skill match · ${openCount} active task${openCount === 1 ? "" : "s"}`;

    return { id: dev.id, displayName: dev.displayName, matchPercent, reason };
  });

  return scored.sort((a, b) => b.matchPercent - a.matchPercent).slice(0, 3);
}


/* Module 1 — duplicate detection using Jaccard token overlap. */
export function jaccardSimilarity(a = "", b = "") {
  const tokens = (value) => new Set((value.toLowerCase().match(/[a-z0-9]+/g) || []).filter(Boolean));
  const A = tokens(a), B = tokens(b);
  if (!A.size || !B.size) return 0;
  let intersection = 0;
  for (const token of A) if (B.has(token)) intersection++;
  const union = new Set([...A, ...B]).size;
  return union ? intersection / union : 0;
}
