import request from "supertest";
import { computePriorityScore, priorityLabelForScore, recommendDevelopers } from "../src/matcher.js";
import { clampPagination } from "../src/issueLoader.js";
import { app } from "../src/app.js";

describe("computePriorityScore (Severity Weight x Category Urgency Weight)", () => {
  test("Critical + Security Vulnerability is the maximum score", () => {
    expect(computePriorityScore("Critical", "Security Vulnerability")).toBe(12);
  });

  test("Low + UI Glitch is the minimum score", () => {
    expect(computePriorityScore("Low", "UI Glitch")).toBe(1);
  });

  test("Medium + API Gateway multiplies weight x urgency", () => {
    expect(computePriorityScore("Medium", "API Gateway")).toBe(4); // 2 x 2
  });

  test("unknown severity/category falls back to weight 1", () => {
    expect(computePriorityScore("Unknown", "Unknown")).toBe(1);
  });
});

describe("priorityLabelForScore boundaries", () => {
  test.each([
    [12, "URGENT", "P0 - Urgent"],
    [10, "URGENT", "P0 - Urgent"],
    [9, "HIGH", "P1 - High"],
    [7, "HIGH", "P1 - High"],
    [6, "MEDIUM", "P2 - Medium"],
    [4, "MEDIUM", "P2 - Medium"],
    [3, "LOW", "P3 - Low"],
    [1, "LOW", "P3 - Low"],
  ])("score %i -> %s / %s", (score, label, display) => {
    expect(priorityLabelForScore(score)).toEqual({ label, display });
  });
});

describe("recommendDevelopers (Smart Developer Matcher)", () => {
  const developers = [
    { id: "USR-DEV3", displayName: "John Park", coreSkills: ["Python", "PostgreSQL", "Backend", "Database"] },
    { id: "USR-DEV2", displayName: "Alice Chen", coreSkills: ["React", "CSS", "Frontend"] },
    { id: "USR-DEV4", displayName: "Maria Silva", coreSkills: ["Security", "Authentication", "API"] },
  ];

  test("ranks the developer whose skills match the bug text highest", () => {
    const results = recommendDevelopers("Login endpoint throws a 500 on expired auth token", developers, {});
    expect(results[0].displayName).toBe("Maria Silva");
  });

  test("returns at most 3 recommendations, sorted by matchPercent descending", () => {
    const results = recommendDevelopers("database query is slow", developers, {});
    expect(results.length).toBeLessThanOrEqual(3);
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].matchPercent).toBeGreaterThanOrEqual(results[i].matchPercent);
    }
  });

  test("a heavier current workload lowers a developer's match score", () => {
    const idle = recommendDevelopers("database migration failing", developers, {});
    const busy = recommendDevelopers("database migration failing", developers, { "USR-DEV3": 5 });
    const idleScore = idle.find((r) => r.id === "USR-DEV3").matchPercent;
    const busyScore = busy.find((r) => r.id === "USR-DEV3").matchPercent;
    expect(busyScore).toBeLessThan(idleScore);
  });
});

describe("clampPagination (Milestone 4 pagination support)", () => {
  test("defaults skip to 0 and limit to null (unpaginated) when both are omitted", () => {
    expect(clampPagination(undefined, undefined)).toEqual({ skip: 0, limit: null });
  });

  test("rejects a negative skip", () => {
    expect(clampPagination(-50, 20)).toEqual({ skip: 0, limit: 20 });
  });

  test("caps an oversized limit at the max page size (200)", () => {
    expect(clampPagination(0, 50000)).toEqual({ skip: 0, limit: 200 });
  });

  test("floors a limit below 1 up to 1", () => {
    expect(clampPagination(0, 0)).toEqual({ skip: 0, limit: 1 });
  });

  test("truncates non-integer input", () => {
    expect(clampPagination(2.9, 10.9)).toEqual({ skip: 2, limit: 10 });
  });
});

describe("GET /api/issues (route-level auth)", () => {
  test("401s before ever touching the database when no token is supplied", async () => {
    const res = await request(app).get("/api/issues");
    expect(res.status).toBe(401);
    expect(res.body.error).toBeTruthy();
  });
});
