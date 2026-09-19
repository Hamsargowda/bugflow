const BASE = "/api/issues";
const AUTH = "/api/auth";
const USERS = "/api/users";
const SPRINTS = "/api/sprints";
const ACTIVITY = "/api/activity";
const NOTIFICATIONS = "/api/notifications";
const ANALYTICS = "/api/analytics";
const V1 = "/api/v1";

function authHeaders(extra = {}) {
  const token = localStorage.getItem("bugflow_token");
  return token ? { ...extra, Authorization: `Bearer ${token}` } : extra;
}

async function handle(res) {
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      /* ignore parse errors */
    }
    throw new Error(message);
  }
  return res.json();
}

export const api = {
  login: async (username, password) => {
    const data = await fetch(`${AUTH}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    }).then(handle);
    localStorage.setItem("bugflow_token", data.token);
    return data.user;
  },

  me: () => fetch(`${AUTH}/me`, { headers: authHeaders() }).then(handle).then((x) => x.user),

  logout: () => localStorage.removeItem("bugflow_token"),

  list: () => fetch(BASE, { headers: authHeaders() }).then(handle),

  // Every active account (any role) — used to populate the Admin-only assign dropdown.
  listUsers: () => fetch(USERS, { headers: authHeaders() }).then(handle),

  checkDuplicates: (title, project) => fetch(`${BASE}/check-duplicates`, {
    method: "POST", headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ title, project }),
  }).then(handle),

  create: (data) =>
    fetch(BASE, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(data),
    }).then(handle),

  patch: (id, patch, activity) =>
    fetch(`${BASE}/${id}`, {
      method: "PATCH",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ patch, activity }),
    }).then(handle),

  remove: (id) => fetch(`${BASE}/${id}`, { method: "DELETE", headers: authHeaders() }).then(handle),

  addComment: (id, author, text) =>
    fetch(`${BASE}/${id}/comments`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ author, text }),
    }).then(handle),

  addTag: (id, tag) =>
    fetch(`${BASE}/${id}/tags`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ tag }),
    }).then(handle),

  removeTag: (id, tag) => fetch(`${BASE}/${id}/tags/${encodeURIComponent(tag)}`, { method: "DELETE", headers: authHeaders() }).then(handle),

  // Assignee -> Admin: submit a resolution report on a Resolved/Closed issue.
  submitResolutionReport: (id, reportText) =>
    fetch(`${BASE}/${id}/resolution-report`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ reportText }),
    }).then(handle),

  // Admin -> reporter: send an update once the resolution report's been reviewed.
  sendAdminUpdate: (id, message) =>
    fetch(`${BASE}/${id}/admin-response`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ message }),
    }).then(handle),

  // ---- Milestone 2 ----

  // Smart Priority Calculator + Smart Developer Matcher preview (Admin only).
  triageRecommendation: (payload) =>
    fetch(`${BASE}/triage-recommendation`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(payload),
    }).then(handle),

  uploadAttachment: (id, file) => {
    const form = new FormData();
    form.append("file", file);
    return fetch(`${BASE}/${id}/attachments`, {
      method: "POST",
      headers: authHeaders(), // no Content-Type — browser sets the multipart boundary
      body: form,
    }).then(handle);
  },

  listSprints: () => fetch(SPRINTS, { headers: authHeaders() }).then(handle),

  backlog: () => fetch(`${SPRINTS}/backlog`, { headers: authHeaders() }).then(handle),

  createSprint: (data) =>
    fetch(SPRINTS, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(data),
    }).then(handle),

  updateSprint: (id, patch) =>
    fetch(`${SPRINTS}/${id}`, {
      method: "PATCH",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(patch),
    }).then(handle),

  addIssueToSprint: (sprintId, issueId) =>
    fetch(`${SPRINTS}/${sprintId}/add-issue/${issueId}`, { method: "POST", headers: authHeaders() }).then(handle),

  removeIssueFromSprint: (sprintId, issueId) =>
    fetch(`${SPRINTS}/${sprintId}/remove-issue/${issueId}`, { method: "DELETE", headers: authHeaders() }).then(handle),

  recentActivity: (limit = 20) => fetch(`${ACTIVITY}/recent?limit=${limit}`, { headers: authHeaders() }).then(handle),

  // ---- Notifications ----

  listNotifications: () => fetch(NOTIFICATIONS, { headers: authHeaders() }).then(handle),

  markNotificationRead: (id) =>
    fetch(`${NOTIFICATIONS}/${id}/read`, { method: "PATCH", headers: authHeaders() }).then(handle),

  markAllNotificationsRead: () =>
    fetch(`${NOTIFICATIONS}/read-all`, { method: "POST", headers: authHeaders() }).then(handle),

  // ---- Milestone 4 — Optimization & Finalization ----

  developerWorkload: () => fetch(`${ANALYTICS}/developer-workload`, { headers: authHeaders() }).then(handle),

  systemPerformance: () => fetch(`${ANALYTICS}/system-performance`, { headers: authHeaders() }).then(handle),

  // ---- Milestone 3: CI/CD, Quality Analytics & Exports ----
  getQualityMetrics: () => fetch(`${V1}/analytics/quality-metrics`, { headers: authHeaders() }).then(handle),
  getDefectTrends: () => fetch(`${V1}/analytics/defect-trends`, { headers: authHeaders() }).then(handle),
  getPlotlyCharts: () => fetch(`${V1}/analytics/plotly-charts`, { headers: authHeaders() }).then(handle),
  simulateGitCommit: (message, commitHash) =>
    fetch(`${V1}/webhooks/git`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, commitHash }),
    }).then(handle),
  exportPdfUrl: () => `${V1}/export/pdf`,
  exportCsvUrl: () => `${V1}/export/csv`,
  explorerGet: (path) => fetch(path, { headers: authHeaders() }).then(handle),
  downloadWithAuth: async (url, fallbackFilename) => {
    const res = await fetch(url, { headers: authHeaders() });
    if (!res.ok) throw new Error(`Download failed (${res.status})`);
    const blob = await res.blob();
    const disposition = res.headers.get("Content-Disposition") || "";
    const match = disposition.match(/filename="?([^"]+)"?/);
    const filename = match ? match[1] : fallbackFilename;
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(objectUrl);
  },
};
