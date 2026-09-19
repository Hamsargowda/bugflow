import request from "supertest";
import { computeCompletionPct, shouldFreezeVelocity } from "../src/routes/sprints.js";
import { app } from "../src/app.js";

describe("computeCompletionPct", () => {
  test("0 issues in the sprint is 0% complete, not a divide-by-zero error", () => {
    expect(computeCompletionPct(0, 0)).toBe(0);
  });

  test("rounds to the nearest whole percent", () => {
    expect(computeCompletionPct(3, 1)).toBe(33); // 33.33... -> 33
  });

  test("a fully resolved sprint is 100%", () => {
    expect(computeCompletionPct(10, 10)).toBe(100);
  });
});

describe("shouldFreezeVelocity", () => {
  test("freezes on the first transition into COMPLETED", () => {
    const result = shouldFreezeVelocity({ currentStatus: "ACTIVE", currentVelocity: null, newStatus: "COMPLETED" });
    expect(result).toBe(true);
  });

  test("does NOT re-freeze a sprint that's already COMPLETED", () => {
    const result = shouldFreezeVelocity({ currentStatus: "COMPLETED", currentVelocity: 7, newStatus: "COMPLETED" });
    expect(result).toBe(false);
  });

  test("does not freeze on any other status transition", () => {
    const result = shouldFreezeVelocity({ currentStatus: "PLANNING", currentVelocity: null, newStatus: "ACTIVE" });
    expect(result).toBe(false);
  });

  test("does not re-freeze even if velocity was somehow already set (defensive)", () => {
    const result = shouldFreezeVelocity({ currentStatus: "ACTIVE", currentVelocity: 4, newStatus: "COMPLETED" });
    expect(result).toBe(false);
  });
});

describe("Sprint creation validation", () => {
  test("POST /api/sprints requires auth before validating anything else", async () => {
    const res = await request(app).post("/api/sprints").send({ name: "Sprint 5" });
    expect(res.status).toBe(401);
  });
});
