import request from "supertest";
import {
  deriveTeam,
  computeMttrHours,
  computeBacklogHealthScore,
  computeDefectLeakageRate,
  computeBugFixRate,
} from "../src/analyticsHelpers.js";
import { app } from "../src/app.js";

describe("deriveTeam", () => {
  test("maps backend-flavored skills to Backend Engineering", () => {
    expect(deriveTeam(["Python", "PostgreSQL", "Backend", "Database"])).toBe("Backend Engineering");
  });

  test("maps frontend-flavored skills to Frontend UI", () => {
    expect(deriveTeam(["React", "CSS", "Frontend"])).toBe("Frontend UI");
  });

  test("maps security/API skills to Platform & API", () => {
    expect(deriveTeam(["Security", "Authentication", "API"])).toBe("Platform & API");
  });

  test("developers with no recognized skill fall back to Unassigned", () => {
    expect(deriveTeam([])).toBe("Unassigned");
    expect(deriveTeam(["Underwater Basket Weaving"])).toBe("Unassigned");
  });
});

describe("computeMttrHours", () => {
  test("returns null (not 0 or NaN) when nothing has resolved yet", () => {
    expect(computeMttrHours([])).toBeNull();
  });

  test("averages raw millisecond durations into hours", () => {
    // 2 hours and 4 hours -> average 3 hours
    const twoHoursMs = 2 * 3_600_000;
    const fourHoursMs = 4 * 3_600_000;
    expect(computeMttrHours([twoHoursMs, fourHoursMs])).toBe(3);
  });

  test("rounds to one decimal place", () => {
    const oneHourMs = 3_600_000;
    const twoHoursMs = 2 * 3_600_000;
    // average of 1h and 2h = 1.5h
    expect(computeMttrHours([oneHourMs, twoHoursMs])).toBe(1.5);
  });
});

describe("computeBacklogHealthScore", () => {
  test("an empty backlog is a perfect 100", () => {
    expect(computeBacklogHealthScore({ totalOpen: 0, staleOpen: 0 })).toBe(100);
  });

  test("no stale issues is also 100", () => {
    expect(computeBacklogHealthScore({ totalOpen: 20, staleOpen: 0 })).toBe(100);
  });

  test("half the backlog stale halves the score", () => {
    expect(computeBacklogHealthScore({ totalOpen: 20, staleOpen: 10 })).toBe(50);
  });

  test("never goes below 0", () => {
    expect(computeBacklogHealthScore({ totalOpen: 5, staleOpen: 5 })).toBe(0);
  });
});

describe("computeDefectLeakageRate", () => {
  test("0 resolved issues is a 0% leakage rate, not a divide-by-zero error", () => {
    expect(computeDefectLeakageRate({ productionResolved: 0, totalResolved: 0 })).toBe(0);
  });

  test("computes the % of fixes whose environment was Production", () => {
    expect(computeDefectLeakageRate({ productionResolved: 3, totalResolved: 12 })).toBe(25);
  });
});

describe("computeBugFixRate", () => {
  test("0 issues is a 0% fix rate", () => {
    expect(computeBugFixRate({ resolvedClosed: 0, total: 0 })).toBe(0);
  });

  test("computes resolved+closed as a % of all issues", () => {
    expect(computeBugFixRate({ resolvedClosed: 85, total: 100 })).toBe(85);
  });
});

describe("Analytics routes require Admin/PM auth", () => {
  test("GET /api/analytics/developer-workload 401s with no token", async () => {
    const res = await request(app).get("/api/analytics/developer-workload");
    expect(res.status).toBe(401);
  });

  test("GET /api/analytics/system-performance 401s with no token", async () => {
    const res = await request(app).get("/api/analytics/system-performance");
    expect(res.status).toBe(401);
  });
});

describe("GET /health (liveness — no database dependency)", () => {
  test("always returns healthy/postgresql, even with no DB configured for this test run", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "healthy", database: "postgresql" });
  });
});
