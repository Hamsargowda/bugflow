import { jest } from "@jest/globals";
import jwt from "jsonwebtoken";
import { signToken, requireAuth, requireRoles } from "../src/auth.js";

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe("signToken", () => {
  test("embeds id, username, displayName, and role as claims", () => {
    const token = signToken({ id: "USR-DEV3", username: "john", displayName: "John Park", role: "Developer" });
    const decoded = jwt.decode(token);
    expect(decoded.sub).toBe("USR-DEV3");
    expect(decoded.username).toBe("john");
    expect(decoded.displayName).toBe("John Park");
    expect(decoded.role).toBe("Developer");
  });

  test("sets a 12h expiry", () => {
    const token = signToken({ id: "USR-DEV3", username: "john", displayName: "John Park", role: "Developer" });
    const decoded = jwt.decode(token);
    expect(decoded.exp - decoded.iat).toBe(12 * 60 * 60);
  });
});

describe("requireAuth", () => {
  test("rejects a request with no Authorization header", () => {
    const req = { headers: {} };
    const res = mockRes();
    const next = jest.fn();

    requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test("rejects a header that isn't a Bearer token", () => {
    const req = { headers: { authorization: "Basic somecreds" } };
    const res = mockRes();
    const next = jest.fn();

    requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test("rejects an invalid/tampered token", () => {
    const req = { headers: { authorization: "Bearer not-a-real-token" } };
    const res = mockRes();
    const next = jest.fn();

    requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: "Invalid or expired session" });
  });

  test("accepts a valid token and attaches the decoded claims to req.user", () => {
    const token = signToken({ id: "USR-DEV2", username: "alice", displayName: "Alice Chen", role: "Developer" });
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = mockRes();
    const next = jest.fn();

    requireAuth(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user.username).toBe("alice");
    expect(req.user.role).toBe("Developer");
  });
});

describe("requireRoles", () => {
  test("blocks a role that isn't in the allow-list", () => {
    const middleware = requireRoles("Admin");
    const req = { user: { role: "Tester" } };
    const res = mockRes();
    const next = jest.fn();

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  test("allows any role that IS in the allow-list", () => {
    const middleware = requireRoles("Admin", "Project Manager");
    const req = { user: { role: "Project Manager" } };
    const res = mockRes();
    const next = jest.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  test("rejects when there's no authenticated user at all", () => {
    const middleware = requireRoles("Admin");
    const req = {};
    const res = mockRes();
    const next = jest.fn();

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
  });
});
