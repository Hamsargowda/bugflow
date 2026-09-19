export const openapiSpec = {
  openapi: "3.1.0",
  info: {
    title: "BugFlow - Software Issue Tracking & Resolution Platform",
    version: "1.0.0",
    description:
      "Centralized issue tracking, keyword-based triage suggestions, sprint management, and quality analytics platform.",
  },
  servers: [{ url: "/" }],
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
    },
    schemas: {
      Issue: {
        type: "object",
        properties: {
          id: { type: "string", example: "BUG-1042" },
          project: { type: "string" },
          title: { type: "string" },
          description: { type: "string" },
          severity: { type: "string", enum: ["Low", "Medium", "High", "Critical"] },
          priority: { type: "string" },
          module: { type: "string" },
          environment: { type: "string" },
          reporter: { type: "string" },
          assignee: { type: "string" },
          status: { type: "string", enum: ["Open", "Triaged", "In Progress", "In Review", "Resolved", "Closed"] },
          inSprint: { type: "boolean" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
          resolvedAt: { type: "string", format: "date-time", nullable: true },
          resolutionReport: { type: "string", nullable: true, description: "What the assignee did to fix it, sent to the Admin" },
          resolutionReportAt: { type: "string", format: "date-time", nullable: true },
          adminResponse: { type: "string", nullable: true, description: "Admin's message to the original reporter" },
          adminResponseAt: { type: "string", format: "date-time", nullable: true },
          reportStatus: { type: "string", enum: ["none", "submitted", "sent"] },
          tags: { type: "array", items: { type: "string" } },
          comments: { type: "array", items: { $ref: "#/components/schemas/Comment" } },
          activity: { type: "array", items: { $ref: "#/components/schemas/Activity" } },
        },
      },
      Comment: {
        type: "object",
        properties: {
          id: { type: "string" },
          author: { type: "string" },
          text: { type: "string" },
          at: { type: "string", format: "date-time" },
        },
      },
      Activity: {
        type: "object",
        properties: {
          id: { type: "string" },
          type: { type: "string" },
          text: { type: "string" },
          at: { type: "string", format: "date-time" },
          actor: { type: "string", nullable: true },
        },
      },
      User: {
        type: "object",
        properties: {
          id: { type: "string" },
          username: { type: "string" },
          displayName: { type: "string" },
          role: { type: "string", enum: ["Developer", "Tester", "Project Manager", "Admin"] },
        },
      },
      Error: {
        type: "object",
        properties: { error: { type: "string" } },
      },
    },
  },
  security: [{ bearerAuth: [] }],
  tags: [
    { name: "Health", description: "Service status" },
    { name: "Authentication", description: "Login and session" },
    { name: "Issues", description: "Core issue CRUD, comments, tags, attachments, and triage" },
    { name: "Sprints", description: "Sprint containers, backlog, and velocity" },
    { name: "Activity", description: "Cross-issue activity feed" },
  ],
  paths: {
    "/api/health": {
      get: {
        tags: ["Health"],
        summary: "Readiness check (confirms the database connection works)",
        security: [],
        responses: { 200: { description: "OK" } },
      },
    },
    "/health": {
      get: {
        tags: ["Health"],
        summary: "Liveness check (Milestone 4 — no database dependency, used by Docker's healthcheck)",
        security: [],
        responses: { 200: { description: "{ status: 'healthy', database: 'postgresql' }" } },
      },
    },
    "/api/auth/login": {
      post: {
        tags: ["Authentication"],
        summary: "Login for access token",
        security: [],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["username", "password"],
                properties: { username: { type: "string" }, password: { type: "string" } },
              },
            },
          },
        },
        responses: {
          200: {
            description: "Login successful",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { token: { type: "string" }, user: { $ref: "#/components/schemas/User" } },
                },
              },
            },
          },
          401: { description: "Invalid credentials", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/api/auth/me": {
      get: {
        tags: ["Authentication"],
        summary: "Read current user",
        responses: {
          200: { description: "Current user", content: { "application/json": { schema: { type: "object", properties: { user: { $ref: "#/components/schemas/User" } } } } } },
          401: { description: "Not authenticated" },
        },
      },
    },
    "/api/issues": {
      get: {
        tags: ["Issues"],
        summary: "List issues (Milestone 4: pass skip/limit to paginate a large table)",
        parameters: [
          { name: "skip", in: "query", schema: { type: "integer", default: 0 }, description: "Rows to skip. Omit both skip and limit to get the full bare-array response (back-compat)." },
          { name: "limit", in: "query", schema: { type: "integer", maximum: 200 }, description: "Page size, capped at 200. Providing this switches the response to { items, total, skip, limit }." },
        ],
        responses: { 200: { description: "Array of issues, or a paginated page when skip/limit are supplied", content: { "application/json": { schema: { type: "array", items: { $ref: "#/components/schemas/Issue" } } } } } },
      },
      post: {
        tags: ["Issues"],
        summary: "Report / create issue",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["title", "description", "reporter"],
                properties: {
                  title: { type: "string" },
                  description: { type: "string" },
                  severity: { type: "string" },
                  priority: { type: "string" },
                  project: { type: "string" },
                  module: { type: "string" },
                  environment: { type: "string" },
                  reporter: { type: "string" },
                  assignee: { type: "string" },
                  tags: { type: "array", items: { type: "string" } },
                },
              },
            },
          },
        },
        responses: { 201: { description: "Created issue", content: { "application/json": { schema: { $ref: "#/components/schemas/Issue" } } } } },
      },
    },
    "/api/issues/{id}": {
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
      patch: {
        tags: ["Issues"],
        summary: "Update issue (status, assignee, sprint membership)",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  patch: {
                    type: "object",
                    properties: {
                      status: { type: "string" },
                      assignee: { type: "string" },
                      inSprint: { type: "boolean" },
                      resolvedAt: { type: "string", format: "date-time", nullable: true },
                    },
                  },
                  activity: {
                    type: "object",
                    properties: { type: { type: "string" }, text: { type: "string" }, actor: { type: "string" } },
                  },
                },
              },
            },
          },
        },
        responses: { 200: { description: "Updated issue", content: { "application/json": { schema: { $ref: "#/components/schemas/Issue" } } } }, 404: { description: "Not found" } },
      },
      delete: {
        tags: ["Issues"],
        summary: "Delete issue",
        responses: { 200: { description: "Deleted" }, 404: { description: "Not found" } },
      },
    },
    "/api/issues/{id}/comments": {
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
      post: {
        tags: ["Issues"],
        summary: "Add comment",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { type: "object", required: ["text"], properties: { author: { type: "string" }, text: { type: "string" } } },
            },
          },
        },
        responses: { 201: { description: "Updated issue with new comment", content: { "application/json": { schema: { $ref: "#/components/schemas/Issue" } } } } },
      },
    },
    "/api/issues/{id}/resolution-report": {
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
      post: {
        tags: ["Issues"],
        summary: "Assignee submits a resolution report on a Resolved/Closed issue, sent to every Admin for review",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["reportText"], properties: { reportText: { type: "string" } } } } },
        },
        responses: {
          200: { description: "Updated issue", content: { "application/json": { schema: { $ref: "#/components/schemas/Issue" } } } },
          403: { description: "Only the assignee (or an Admin) can submit the report" },
          409: { description: "Issue isn't Resolved/Closed yet" },
        },
      },
    },
    "/api/issues/{id}/admin-response": {
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
      post: {
        tags: ["Issues"],
        summary: "Admin reviews the resolution report and sends their own update to the original reporter",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["message"], properties: { message: { type: "string" } } } } },
        },
        responses: {
          200: { description: "Updated issue", content: { "application/json": { schema: { $ref: "#/components/schemas/Issue" } } } },
          409: { description: "No resolution report submitted yet" },
        },
      },
    },
    "/api/issues/{id}/tags": {
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
      post: {
        tags: ["Issues"],
        summary: "Add tag",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["tag"], properties: { tag: { type: "string" } } } } },
        },
        responses: { 201: { description: "Updated issue", content: { "application/json": { schema: { $ref: "#/components/schemas/Issue" } } } } },
      },
    },
    "/api/issues/{id}/tags/{tag}": {
      parameters: [
        { name: "id", in: "path", required: true, schema: { type: "string" } },
        { name: "tag", in: "path", required: true, schema: { type: "string" } },
      ],
      delete: {
        tags: ["Issues"],
        summary: "Remove tag",
        responses: { 200: { description: "Updated issue", content: { "application/json": { schema: { $ref: "#/components/schemas/Issue" } } } } },
      },
    },
    "/api/issues/triage-recommendation": {
      post: {
        tags: ["Issues"],
        summary: "Smart Priority Calculator + Smart Developer Matcher (preview, Admin only)",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["severity", "category"],
                properties: {
                  title: { type: "string" },
                  description: { type: "string" },
                  severity: { type: "string", enum: ["Low", "Medium", "High", "Critical"] },
                  category: { type: "string", enum: ["Security Vulnerability", "Database Error", "API Gateway", "Backend Logic", "UI Glitch"] },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: "Computed priority score/label and top 3 recommended developers",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    priorityScore: { type: "number" },
                    priorityLabel: { type: "string" },
                    priority: { type: "string" },
                    recommendations: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: { id: { type: "string" }, displayName: { type: "string" }, matchPercent: { type: "integer" }, reason: { type: "string" } },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/issues/{id}/attachments": {
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
      post: {
        tags: ["Issues"],
        summary: "Upload a screenshot (.png/.jpg) or log (.log) file to an issue",
        requestBody: {
          required: true,
          content: { "multipart/form-data": { schema: { type: "object", properties: { file: { type: "string", format: "binary" } } } } },
        },
        responses: { 201: { description: "Updated issue with new attachment", content: { "application/json": { schema: { $ref: "#/components/schemas/Issue" } } } } },
      },
    },
    "/api/issues/{id}/attachments/{attachmentId}": {
      get: {
        tags: ["Issues"],
        summary: "Download an attachment",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
          { name: "attachmentId", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: { 200: { description: "Raw file bytes" }, 404: { description: "Not found" } },
      },
    },
    "/api/activity/recent": {
      get: {
        tags: ["Activity"],
        summary: "Live Activity Stream — latest activity across every issue",
        parameters: [{ name: "limit", in: "query", schema: { type: "integer", default: 20 } }],
        responses: { 200: { description: "Recent activity entries" } },
      },
    },
    "/api/sprints": {
      get: { tags: ["Sprints"], summary: "List sprints with live issue counts/completion", responses: { 200: { description: "Array of sprints" } } },
      post: {
        tags: ["Sprints"],
        summary: "Create a new sprint (Admin, Project Manager)",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["name"], properties: { name: { type: "string" }, goal: { type: "string" }, startDate: { type: "string", format: "date" }, endDate: { type: "string", format: "date" } } } } },
        },
        responses: { 201: { description: "Created sprint" } },
      },
    },
    "/api/sprints/backlog": {
      get: { tags: ["Sprints"], summary: "Issues not yet assigned to any sprint", responses: { 200: { description: "Array of backlog issues" } } },
    },
    "/api/sprints/{id}": {
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
      patch: {
        tags: ["Sprints"],
        summary: "Update a sprint (status transitions freeze velocity at COMPLETED)",
        responses: { 200: { description: "Updated sprint" } },
      },
    },
    "/api/sprints/{id}/add-issue/{issueId}": {
      post: {
        tags: ["Sprints"],
        summary: "Move an issue from the Backlog into this Sprint",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
          { name: "issueId", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: { 200: { description: "Success" } },
      },
    },
    "/api/analytics/developer-workload": {
      get: {
        tags: ["Analytics"],
        summary: "Milestone 4 — per-developer active tasks, completed fixes, and avg MTTR (Admin, Project Manager)",
        responses: { 200: { description: "Developer workload matrix + resource-balance indicator" } },
      },
    },
    "/api/analytics/system-performance": {
      get: {
        tags: ["Analytics"],
        summary: "Milestone 4 — fix rate, MTTR, backlog health, defect leakage, DB pool + response-time stats (Admin, Project Manager)",
        responses: { 200: { description: "KPI + scale metrics" } },
      },
    },
  },
};
