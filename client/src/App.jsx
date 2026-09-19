import React, { useState, useMemo, useEffect, useCallback } from "react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, Cell,
} from "recharts";
import {
  Bug, Plus, Search, LayoutDashboard, KanbanSquare, BarChart3, Building2,
  MessageSquare, Clock, X, AlertTriangle, CheckCircle2, Download, Tag as TagIcon,
  ShieldCheck, ArrowRight, Trash2, UserCircle2, ChevronDown, Sparkles, ListChecks,
  Loader2, WifiOff, LogOut, Workflow, Paperclip, Users, Rss, FileDown, ArrowLeftRight,
  Settings as SettingsIcon, Bell, TrendingUp, CalendarClock, FileText, Send,
  Gauge, Database, Rocket, BookOpen, GitBranch,
} from "lucide-react";
import { api } from "./api.js";
import DevOpsDashboardView from "./DevOpsDashboardView.jsx";

/* ---------------------------------------------------------------------- */
/*  Constants & mock reference data                                        */
/* ---------------------------------------------------------------------- */

const STATUSES = ["Open", "Triaged", "In Progress", "In Review", "QA Verification", "Resolved", "Closed"];
const SEVERITIES = ["Low", "Medium", "High", "Critical"];
const PRIORITIES = ["P3 - Low", "P2 - Medium", "P1 - High", "P0 - Urgent"];
const CATEGORIES = ["Security Vulnerability", "Database Error", "API Gateway", "Backend Logic", "UI Glitch"];
const PROJECTS = ["BugFlow Core", "Checkout & Payments", "Mobile Apps"];
const MODULES = [
  "Authentication", "Payments Gateway", "Search", "Notifications", "Dashboard UI",
  "API Gateway", "Mobile UI", "Reporting", "Onboarding", "Sync Engine", "Admin Panel",
];
const ENVIRONMENTS = ["Production", "Staging", "Development"];
const TEAM = ["Priya Nair", "Marcus Webb", "Sofia Torres", "Diego Alvarez", "Han Ji-woo", "Emily Zhang"];
const PERMISSIONS = {
  Developer:        { create: true, comment: true, editStatus: true,  assign: false, del: false, dragCards: true,  manageSprint: false, viewAnalytics: true,  viewAdmin: false },
  Tester:           { create: true, comment: true, editStatus: false, assign: false, del: false, dragCards: false, manageSprint: false, viewAnalytics: false, viewAdmin: false },
  "Project Manager":{ create: true, comment: true, editStatus: true,  assign: false, del: false, dragCards: true,  manageSprint: true,  viewAnalytics: true,  viewAdmin: true  },
  Admin:            { create: true, comment: true, editStatus: true,  assign: true,  del: true,  dragCards: true,  manageSprint: true,  viewAnalytics: true,  viewAdmin: true  },
  // Reporting-only role: files issues, comments, and tracks them — same
  // day-to-day permissions as Tester, but conceptually the "customer" role.
  User:             { create: true, comment: true, editStatus: false, assign: false, del: false, dragCards: false, manageSprint: false, viewAnalytics: false, viewAdmin: false },
  Triager:          { create: true, comment: true, editStatus: true,  assign: true,  del: false, dragCards: true,  manageSprint: false, viewAnalytics: true,  viewAdmin: false },
  Stakeholder:      { create: false, comment: false, editStatus: false, assign: false, del: false, dragCards: false, manageSprint: false, viewAnalytics: true,  viewAdmin: false },
};

const SEVERITY_STYLE = {
  Low:      "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  Medium:   "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
  High:     "bg-orange-50 text-orange-700 ring-1 ring-orange-200",
  Critical: "bg-rose-50 text-rose-700 ring-1 ring-rose-200",
};
const SEVERITY_DOT = { Low: "bg-emerald-500", Medium: "bg-amber-500", High: "bg-orange-500", Critical: "bg-rose-600" };

const SPRINT_NAME = "Sprint 24";
const SPRINT_RANGE = "Aug 25 – Sep 7";

/* ---------------------------------------------------------------------- */
/*  Date helpers                                                           */
/* ---------------------------------------------------------------------- */

function offsetDate(daysBack, hourOffset = 0) {
  const d = new Date();
  d.setDate(d.getDate() - daysBack);
  d.setHours(d.getHours() - hourOffset, 0, 0, 0);
  return d.toISOString();
}
function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
function fmtDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
function daysBetween(a, b) {
  return Math.max(0, (new Date(b) - new Date(a)) / (1000 * 60 * 60 * 24));
}

/* ---------------------------------------------------------------------- */
/*  Classification helpers (keyword-based auto suggestion)                 */
/* ---------------------------------------------------------------------- */

const SEVERITY_KEYWORDS = {
  Critical: ["crash", "data loss", "security", "breach", "outage", "down", "cannot log in", "corrupt", "payment fail", "unusable"],
  High:     ["error", "fails", "failing", "broken", "blocked", "regression", "exception", "timeout", "incorrect charge"],
  Medium:   ["slow", "delay", "incorrect", "mismatch", "inconsistent", "intermittent", "warning"],
  Low:      ["typo", "cosmetic", "spacing", "minor", "suggestion", "style", "alignment"],
};
const SEVERITY_TO_PRIORITY = { Critical: "P0 - Urgent", High: "P1 - High", Medium: "P2 - Medium", Low: "P3 - Low" };

function suggestClassification(text) {
  const t = text.toLowerCase();
  for (const sev of ["Critical", "High", "Medium", "Low"]) {
    if (SEVERITY_KEYWORDS[sev].some((k) => t.includes(k))) {
      return { severity: sev, priority: SEVERITY_TO_PRIORITY[sev] };
    }
  }
  return null;
}

function normalizeTitle(s) {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter(Boolean);
}
function similarity(a, b) {
  const A = new Set(normalizeTitle(a));
  const B = new Set(normalizeTitle(b));
  if (A.size === 0 || B.size === 0) return 0;
  let overlap = 0;
  A.forEach((w) => { if (B.has(w)) overlap++; });
  return overlap / new Set([...A, ...B]).size;
}
function findDuplicates(title, issues) {
  if (!title || title.trim().length < 4) return [];
  return issues
    .map((i) => ({ issue: i, score: similarity(title, i.title) }))
    .filter((x) => x.score >= 0.4)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

/* ---------------------------------------------------------------------- */
/*  CSV export                                                             */
/* ---------------------------------------------------------------------- */

function exportCSV(issues, filename) {
  const headers = ["ID", "Title", "Severity", "Priority", "Status", "Project", "Module", "Assignee", "Reporter", "Created", "Updated", "Resolved"];
  const rows = issues.map((i) => [
    i.id, i.title, i.severity, i.priority, i.status, i.project, i.module,
    i.assignee, i.reporter, fmtDate(i.createdAt), fmtDate(i.updatedAt), fmtDate(i.resolvedAt),
  ]);
  const csv = [headers, ...rows]
    .map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename || "bugflow-export.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}


/* ---------------------------------------------------------------------- */
/*  Small shared UI atoms                                                  */
/* ---------------------------------------------------------------------- */

const heading = { fontFamily: "'Space Grotesk', sans-serif" };
const mono = { fontFamily: "'JetBrains Mono', monospace" };

function SeverityBadge({ severity }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium ${SEVERITY_STYLE[severity]}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${SEVERITY_DOT[severity]}`} />
      {severity}
    </span>
  );
}

function PriorityChip({ priority }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-slate-100 text-slate-600" style={mono}>
      {priority.split(" - ")[0]}
    </span>
  );
}

/* Signature element: circuit-trace pipeline showing status progress */
function PipelineTrace({ status, size = "sm", showLabels = false }) {
  const idx = STATUSES.indexOf(status);
  const dotSize = size === "sm" ? "w-2 h-2" : "w-3 h-3";
  const lineW = size === "sm" ? "w-3" : "w-6";
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center">
        {STATUSES.map((s, i) => (
          <React.Fragment key={s}>
            <span
              title={s}
              className={`rounded-full ${dotSize} shrink-0 transition-colors ${
                i < idx ? "bg-violet-500" : i === idx ? (s === "Closed" ? "bg-emerald-500" : "bg-violet-500") : "bg-slate-200"
              } ${i === idx ? "ring-4 ring-violet-100" : ""}`}
            />
            {i < STATUSES.length - 1 && (
              <span className={`h-px ${lineW} ${i < idx ? "bg-violet-400" : "bg-slate-200"}`} />
            )}
          </React.Fragment>
        ))}
      </div>
      {showLabels && (
        <div className="flex justify-between text-[10px] text-slate-400" style={mono}>
          <span>{STATUSES[0]}</span>
          <span>{STATUSES[STATUSES.length - 1]}</span>
        </div>
      )}
    </div>
  );
}

function Avatar({ name }) {
  if (!name || name === "Unassigned") {
    return <span className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-slate-400"><UserCircle2 className="w-4 h-4" /></span>;
  }
  const initials = name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();
  const colors = ["bg-violet-100 text-violet-700", "bg-teal-100 text-teal-700", "bg-amber-100 text-amber-700", "bg-rose-100 text-rose-700", "bg-blue-100 text-blue-700", "bg-fuchsia-100 text-fuchsia-700"];
  const color = colors[name.length % colors.length];
  return <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold ${color}`} style={mono} title={name}>{initials}</span>;
}

function Select({ value, onChange, options, className = "" }) {
  return (
    <div className={`relative ${className}`}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none w-full bg-white border border-slate-200 rounded-lg pl-3 pr-8 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-violet-400"
      >
        {options.map((o) => (typeof o === "string" ? <option key={o} value={o}>{o}</option> : <option key={o.value} value={o.value}>{o.label}</option>))}
      </select>
      <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/*  Main App                                                               */
/* ---------------------------------------------------------------------- */

function AuthenticatedBugFlow({ user, onLogout }) {
  const [issues, setIssues] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [view, setView] = useState("overview");
  const [selectedId, setSelectedId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({ severity: "All", status: "All", module: "All", project: "All" });
  const [toast, setToast] = useState(null);
  const [notifications, setNotifications] = useState([]);

  const role = user.role;
  const perms = PERMISSIONS[role];

  function notify(msg) {
    setToast(msg);
    setTimeout(() => setToast(null), 2400);
  }

  function notifyError(err) {
    notify(err?.message || "Something went wrong — is the API server running?");
  }

  const refresh = useCallback(async () => {
    try {
      const data = await api.list();
      setIssues(data);
      setLoadError(null);
    } catch (err) {
      setLoadError(err.message || "Failed to reach the BugFlow API");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    // Only Admin ever needs the full account list (to assign issues), but it's
    // harmless and cheap to fetch once for any signed-in user.
    api.listUsers().then(setUsers).catch(() => {});
  }, [refresh]);

  const refreshNotifications = useCallback(() => {
    api.listNotifications().then(setNotifications).catch(() => {});
  }, []);

  useEffect(() => {
    refreshNotifications();
    const interval = setInterval(refreshNotifications, 30000); // poll every 30s
    return () => clearInterval(interval);
  }, [refreshNotifications]);

  // Issues can be created/assigned/resolved/reported-on from someone else's
  // session (e.g. an Admin assigning a User's ticket) — without this, a
  // signed-in User staring at "My reported issues" in Settings would only
  // ever see it change after a manual page reload. Poll periodically and
  // also refresh the moment the tab regains focus, same as notifications.
  useEffect(() => {
    const interval = setInterval(refresh, 30000); // poll every 30s
    function onFocus() {
      refresh();
      refreshNotifications();
    }
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [refresh, refreshNotifications]);

  async function markNotificationRead(id) {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    try {
      await api.markNotificationRead(id);
    } catch {
      /* best effort */
    }
  }

  async function markAllNotificationsRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    try {
      await api.markAllNotificationsRead();
    } catch {
      /* best effort */
    }
  }

  function replaceIssue(updated) {
    setIssues((prev) => {
      const exists = prev.some((i) => i.id === updated.id);
      return exists ? prev.map((i) => (i.id === updated.id ? updated : i)) : [updated, ...prev];
    });
  }

  async function addIssue(data) {
    try {
      const issue = await api.create(data);
      replaceIssue(issue);
      notify(`${issue.id} created`);
      return issue.id;
    } catch (err) {
      notifyError(err);
      return null;
    }
  }

  async function changeStatus(id, newStatus) {
    const issue = issues.find((i) => i.id === id);
    const oldStatus = issue?.status;
    const patch = { status: newStatus };
    if (newStatus === "Resolved" || newStatus === "Closed") {
      if (issue && !issue.resolvedAt) patch.resolvedAt = new Date().toISOString();
    }
    try {
      const updated = await api.patch(id, patch, {
        type: "status",
        text: `Status changed from ${oldStatus} to ${newStatus}`,
        actor: user.displayName,
        oldValue: oldStatus,
        newValue: newStatus,
      });
      replaceIssue(updated);
    } catch (err) {
      notifyError(err);
    }
  }

  // Admin-only: review/adjust severity, category & priority on a still-Open issue
  // and move it to Triaged in one step. Assignment is gated on this having happened first.
  async function triageIssue(id, { severity, priority, category }) {
    try {
      const updated = await api.patch(
        id,
        { status: "Triaged", severity, priority, category },
        {
          type: "status",
          text: `Triaged — severity ${severity}, category ${category}, priority ${priority}`,
          actor: user.displayName,
          oldValue: "Open",
          newValue: "Triaged",
        }
      );
      replaceIssue(updated);
      notify(`${id} triaged`);
    } catch (err) {
      notifyError(err);
    }
  }

  async function assignIssue(id, assignee, dueDate) {
    const patch = { assignee };
    let text = `Assigned to ${assignee}`;
    if (dueDate !== undefined) {
      patch.dueDate = dueDate || null;
      if (dueDate) text += ` — due ${fmtDate(dueDate)}`;
    }
    try {
      const updated = await api.patch(id, patch, { type: "assign", text, actor: user.displayName });
      replaceIssue(updated);
    } catch (err) {
      notifyError(err);
    }
  }

  // Assignee -> Admin: submit the write-up of what was done to resolve the issue.
  async function submitResolutionReport(id, reportText) {
    if (!reportText.trim()) return;
    try {
      const updated = await api.submitResolutionReport(id, reportText.trim());
      replaceIssue(updated);
      notify(`Report sent for ${id}`);
    } catch (err) {
      notifyError(err);
    }
  }

  // Admin -> reporter: after reviewing the report, send the update that
  // actually tells the person who reported it that it's been resolved.
  async function sendAdminUpdate(id, message) {
    if (!message.trim()) return;
    try {
      const updated = await api.sendAdminUpdate(id, message.trim());
      replaceIssue(updated);
      notify(`Update sent for ${id}`);
    } catch (err) {
      notifyError(err);
    }
  }

  async function addComment(id, text) {
    if (!text.trim()) return;
    try {
      const updated = await api.addComment(id, user.displayName, text.trim());
      replaceIssue(updated);
    } catch (err) {
      notifyError(err);
    }
  }

  async function addTag(id, tag) {
    if (!tag.trim()) return;
    try {
      const updated = await api.addTag(id, tag.trim().toLowerCase());
      replaceIssue(updated);
    } catch (err) {
      notifyError(err);
    }
  }

  async function removeTag(id, tag) {
    try {
      const updated = await api.removeTag(id, tag);
      replaceIssue(updated);
    } catch (err) {
      notifyError(err);
    }
  }

  async function uploadAttachment(id, file) {
    const updated = await api.uploadAttachment(id, file); // let the caller catch/display errors
    replaceIssue(updated);
  }

  async function deleteIssue(id) {
    try {
      await api.remove(id);
      setIssues((prev) => prev.filter((i) => i.id !== id));
      setSelectedId(null);
      notify(`${id} deleted`);
    } catch (err) {
      notifyError(err);
    }
  }

  async function moveKanban(id, column) {
    const issue = issues.find((i) => i.id === id);
    if (!issue) return;
    let patch, activityText;
    if (column === "backlog") {
      patch = { inSprint: false };
      activityText = "Moved to Backlog";
    } else if (column === "sprint") {
      const status = issue.status === "Open" ? "Triaged" : issue.status === "Resolved" || issue.status === "Closed" ? "In Progress" : issue.status;
      patch = { inSprint: true, status };
      activityText = "Pulled into sprint";
    } else if (column === "done") {
      patch = { inSprint: true, status: "Resolved" };
      if (!issue.resolvedAt) patch.resolvedAt = new Date().toISOString();
      activityText = "Marked Resolved";
    } else {
      return;
    }
    try {
      const updated = await api.patch(id, patch, { type: "status", text: activityText, actor: user.displayName });
      replaceIssue(updated);
    } catch (err) {
      notifyError(err);
    }
  }

  const selected = issues.find((i) => i.id === selectedId) || null;

  const filteredIssues = useMemo(() => {
    return issues.filter((i) => {
      if (filters.severity !== "All" && i.severity !== filters.severity) return false;
      if (filters.status !== "All" && i.status !== filters.status) return false;
      if (filters.module !== "All" && i.module !== filters.module) return false;
      if (filters.project !== "All" && i.project !== filters.project) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        if (!i.title.toLowerCase().includes(q) && !i.id.toLowerCase().includes(q) && !i.tags.some((t) => t.includes(q))) return false;
      }
      return true;
    });
  }, [issues, filters, search]);

  const navItems = [
    { key: "overview", label: "Overview", icon: LayoutDashboard, show: true },
    { key: "issues", label: "Issues", icon: ListChecks, show: true },
    { key: "board", label: "Sprint Board", icon: KanbanSquare, show: true },
    { key: "workflow", label: "Workflow & Collaboration", icon: Workflow, show: true },
    { key: "sprintAnalysis", label: "Sprint Analysis", icon: TrendingUp, show: perms.viewAnalytics },
    { key: "analytics", label: "Analytics", icon: BarChart3, show: perms.viewAnalytics },
    { key: "devops-dashboard", label: "Milestone 3: Analytics & APIs", icon: GitBranch, show: perms.viewAnalytics },
    { key: "admin", label: "Admin Overview", icon: Building2, show: perms.viewAdmin },
    { key: "milestone4", label: "Milestone 4: Optimization & Finalization", icon: Gauge, show: perms.viewAdmin },
    { key: "settings", label: "Settings", icon: SettingsIcon, show: true },
  ];

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50 text-slate-500 gap-2" style={{ fontFamily: "'Inter', sans-serif" }}>
        <Loader2 className="w-5 h-5 animate-spin" /> Loading BugFlow…
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50 p-6" style={{ fontFamily: "'Inter', sans-serif" }}>
        <div className="max-w-md text-center">
          <WifiOff className="w-8 h-8 text-rose-400 mx-auto mb-3" />
          <h1 className="text-lg font-semibold text-slate-800 mb-1">Can't reach the BugFlow API</h1>
          <p className="text-sm text-slate-500 mb-4">{loadError}</p>
          <p className="text-xs text-slate-400 mb-4">
            Make sure the server is running (<code>npm run dev</code> in <code>/server</code>) and Postgres is up.
          </p>
          <button onClick={refresh} className="px-4 py-2 rounded-lg text-sm font-medium bg-violet-600 hover:bg-violet-700 text-white">
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-slate-50 text-slate-800" style={{ fontFamily: "'Inter', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');
        ::-webkit-scrollbar { width: 8px; height: 8px; }
        ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 8px; }
      `}</style>

      {/* Sidebar */}
      <aside className="w-56 shrink-0 bg-slate-900 text-slate-300 flex flex-col">
        <div className="flex items-center gap-2 px-5 py-5 border-b border-slate-800">
          <div className="w-8 h-8 rounded-lg bg-violet-500 flex items-center justify-center">
            <Bug className="w-4.5 h-4.5 text-white" />
          </div>
          <span className="text-white font-semibold text-[15px] tracking-tight" style={heading}>BugFlow</span>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.filter((n) => n.show).map((n) => {
            const Icon = n.icon;
            const active = view === n.key;
            return (
              <button
                key={n.key}
                onClick={() => setView(n.key)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                  active ? "bg-violet-500/15 text-violet-300 font-medium" : "hover:bg-slate-800 text-slate-400"
                }`}
              >
                <Icon className="w-4 h-4" />
                {n.label}
              </button>
            );
          })}
        </nav>
        <div className="px-3 py-4 border-t border-slate-800">
          <div className="px-3 mb-2">
            <div className="text-sm text-white font-medium truncate">{user.displayName}</div>
            <div className="text-[10px] uppercase tracking-wider text-violet-300 mt-0.5" style={mono}>{role}</div>
          </div>
          <button
            onClick={onLogout}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
          >
            <LogOut className="w-4 h-4" /> Sign out
          </button>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="h-16 shrink-0 border-b border-slate-200 bg-white flex items-center gap-4 px-6">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); if (e.target.value && view !== "issues") setView("issues"); }}
              placeholder="Search issues, IDs, tags…"
              className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-violet-400"
            />
          </div>
          <div className="flex-1" />
          <div className="text-xs text-slate-400 hidden md:block" style={mono}>{SPRINT_NAME} · {SPRINT_RANGE}</div>
          <NotificationBell
            notifications={notifications}
            onOpenIssue={(issueId) => { if (issueId) setSelectedId(issueId); }}
            onMarkRead={markNotificationRead}
            onMarkAllRead={markAllNotificationsRead}
          />
          {perms.create && (
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-1.5 bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium px-3.5 py-2 rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" /> New Issue
            </button>
          )}
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          {view === "overview" && <Overview issues={issues} onOpen={setSelectedId} onGo={setView} />}
          {view === "issues" && (
            <IssuesView
              issues={filteredIssues}
              allCount={issues.length}
              filters={filters}
              setFilters={setFilters}
              onOpen={setSelectedId}
              onStatusChange={changeStatus}
              perms={perms}
            />
          )}
          {view === "board" && <BoardView issues={issues} onOpen={setSelectedId} onMove={moveKanban} perms={perms} />}
          {view === "workflow" && (
            <WorkflowCollaborationView
              issues={issues}
              perms={perms}
              role={role}
              onOpen={setSelectedId}
              onStatusChange={changeStatus}
            />
          )}
          {view === "sprintAnalysis" && perms.viewAnalytics && <SprintAnalysisView issues={issues} />}
          {view === "analytics" && perms.viewAnalytics && <AnalyticsView issues={issues} />}
          {view === "devops-dashboard" && perms.viewAnalytics && <DevOpsDashboardView issues={issues} />}
          {view === "admin" && perms.viewAdmin && <AdminView issues={issues} onGo={setView} setFilters={setFilters} />}
          {view === "milestone4" && perms.viewAdmin && <Milestone4View issues={issues} />}
          {view === "settings" && (
            <SettingsView
              role={role}
              user={user}
              issues={issues}
              users={users}
              onAssign={assignIssue}
              onOpen={setSelectedId}
              notifications={notifications}
              onMarkAllRead={markAllNotificationsRead}
              onSubmitReport={submitResolutionReport}
              onSendUpdate={sendAdminUpdate}
            />
          )}
        </main>
      </div>

      {showForm && (
        <IssueFormModal
          issues={issues}
          onClose={() => setShowForm(false)}
          onSubmit={(data) => { addIssue(data); setShowForm(false); }}
          role={role}
          user={user}
        />
      )}

      {selected && (
        <IssueDetailModal
          issue={selected}
          perms={perms}
          role={role}
          user={user}
          users={users}
          onClose={() => setSelectedId(null)}
          onStatusChange={changeStatus}
          onTriage={triageIssue}
          onAssign={assignIssue}
          onComment={addComment}
          onAddTag={addTag}
          onRemoveTag={removeTag}
          onUploadAttachment={uploadAttachment}
          onDelete={deleteIssue}
          onSubmitReport={submitResolutionReport}
          onSendUpdate={sendAdminUpdate}
        />
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 bg-slate-900 text-white text-sm px-4 py-2.5 rounded-lg shadow-lg flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" /> {toast}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/*  Notification bell                                                      */
/* ---------------------------------------------------------------------- */

const NOTIFICATION_ICON_TONE = {
  issue_created: "text-violet-500",
  assigned: "text-blue-500",
  resolved: "text-emerald-500",
  resolved_admin: "text-emerald-500",
  overdue: "text-rose-500",
};

function NotificationBell({ notifications, onOpenIssue, onMarkRead, onMarkAllRead }) {
  const [open, setOpen] = useState(false);
  const unread = notifications.filter((n) => !n.read).length;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative w-9 h-9 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100 transition-colors"
      >
        <Bell className="w-4.5 h-4.5" />
        {unread > 0 && (
          <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-rose-500 ring-2 ring-white" />
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-11 w-80 bg-white border border-slate-200 rounded-xl shadow-xl z-40 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
              <span className="text-sm font-medium text-slate-800" style={heading}>Notifications</span>
              {unread > 0 && (
                <button onClick={onMarkAllRead} className="text-xs text-violet-600 hover:text-violet-700 font-medium">Mark all read</button>
              )}
            </div>
            <div className="max-h-80 overflow-y-auto divide-y divide-slate-50">
              {notifications.map((n) => (
                <button
                  key={n.id}
                  onClick={() => { onMarkRead(n.id); onOpenIssue(n.issueId); setOpen(false); }}
                  className={`w-full text-left px-4 py-3 flex gap-2.5 hover:bg-slate-50 transition-colors ${!n.read ? "bg-violet-50/40" : ""}`}
                >
                  <Bell className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${NOTIFICATION_ICON_TONE[n.type] || "text-slate-400"}`} />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-slate-700 leading-snug">{n.message}</div>
                    <div className="text-[10px] text-slate-300 mt-0.5" style={mono}>{fmtRelativeTime(n.createdAt)}</div>
                  </div>
                  {!n.read && <span className="w-1.5 h-1.5 rounded-full bg-violet-500 mt-1.5 shrink-0" />}
                </button>
              ))}
              {notifications.length === 0 && (
                <div className="text-xs text-slate-400 text-center py-8">You're all caught up</div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/*  Authentication                                                          */
/* ---------------------------------------------------------------------- */

function LoginPage({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const user = await api.login(username, password);
      onLogin(user);
    } catch (err) {
      setError(err.message || "Unable to sign in");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6" style={{ fontFamily: "'Inter', sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&display=swap');`}</style>
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
          <div className="px-7 py-8 bg-slate-900 text-white">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-violet-500 flex items-center justify-center"><Bug className="w-5 h-5" /></div>
              <div>
                <h1 className="text-xl font-semibold" style={heading}>BugFlow</h1>
                <p className="text-xs text-slate-400 mt-0.5">Issue management workspace</p>
              </div>
            </div>
          </div>
          <form onSubmit={submit} className="p-7 space-y-5">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Sign in</h2>
              <p className="text-sm text-slate-500 mt-1">Your role is assigned by the BugFlow server.</p>
            </div>
            {error && <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</div>}
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">Username</label>
              <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoFocus placeholder="Enter username" className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-violet-400" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">Password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" placeholder="Enter password" className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-violet-400" />
            </div>
            <button disabled={busy} className="w-full flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white font-medium px-4 py-2.5 rounded-lg transition-colors">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {busy ? "Signing in…" : "Sign in"}
            </button>
            <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-xs text-slate-500">
              <div className="font-medium text-slate-700 mb-1">Demo accounts</div>
              <div>developer · tester · manager · admin · user</div>
              <div className="mt-0.5">Password: <span style={mono}>BugFlow@123</span></div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default function BugFlow() {
  const [user, setUser] = useState(null);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("bugflow_token");
    if (!token) {
      setCheckingSession(false);
      return;
    }
    api.me()
      .then(setUser)
      .catch(() => api.logout())
      .finally(() => setCheckingSession(false));
  }, []);

  function logout() {
    api.logout();
    setUser(null);
  }

  if (checkingSession) {
    return <div className="flex h-screen items-center justify-center bg-slate-50 text-slate-500 gap-2"><Loader2 className="w-5 h-5 animate-spin" /> Checking session…</div>;
  }
  if (!user) return <LoginPage onLogin={setUser} />;
  return <AuthenticatedBugFlow user={user} onLogout={logout} />;
}

/* ---------------------------------------------------------------------- */
/*  Overview                                                               */
/* ---------------------------------------------------------------------- */

function Overview({ issues, onOpen, onGo }) {
  const open = issues.filter((i) => !["Resolved", "Closed"].includes(i.status));
  const critical = issues.filter((i) => i.severity === "Critical" && i.status !== "Closed");
  const resolvedThisWeek = issues.filter((i) => i.resolvedAt && daysBetween(i.resolvedAt, new Date().toISOString()) <= 7);
  const recent = [...issues].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)).slice(0, 6);

  const cards = [
    { label: "Open issues", value: open.length, sub: `${issues.length} total`, tone: "text-slate-900" },
    { label: "Critical & unresolved", value: critical.length, sub: "needs attention", tone: "text-rose-600" },
    { label: "Resolved this week", value: resolvedThisWeek.length, sub: "past 7 days", tone: "text-emerald-600" },
    { label: "In current sprint", value: issues.filter((i) => i.inSprint).length, sub: SPRINT_NAME, tone: "text-violet-600" },
  ];

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900" style={heading}>Overview</h1>
        <p className="text-sm text-slate-500 mt-1">A pulse on everything moving through BugFlow right now.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {cards.map((c) => (
          <div key={c.label} className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="text-xs text-slate-500 mb-1.5">{c.label}</div>
            <div className={`text-3xl font-semibold ${c.tone}`} style={heading}>{c.value}</div>
            <div className="text-[11px] text-slate-400 mt-1" style={mono}>{c.sub}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-medium text-slate-800" style={heading}>Recently updated</h2>
            <button onClick={() => onGo("issues")} className="text-xs text-violet-600 hover:text-violet-700 font-medium flex items-center gap-1">
              View all <ArrowRight className="w-3 h-3" />
            </button>
          </div>
          <div className="divide-y divide-slate-100">
            {recent.map((i) => (
              <button key={i.id} onClick={() => onOpen(i.id)} className="w-full text-left px-5 py-3 flex items-center gap-3 hover:bg-slate-50 transition-colors">
                <span className="text-[11px] text-slate-400 w-16 shrink-0" style={mono}>{i.id}</span>
                <SeverityBadge severity={i.severity} />
                <span className="text-sm text-slate-700 truncate flex-1">{i.title}</span>
                <PipelineTrace status={i.status} />
              </button>
            ))}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <h2 className="font-medium text-slate-800 mb-3" style={heading}>Pipeline snapshot</h2>
          <div className="space-y-3">
            {STATUSES.map((s) => {
              const count = issues.filter((i) => i.status === s).length;
              const pct = Math.round((count / issues.length) * 100) || 0;
              return (
                <div key={s}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-600">{s}</span>
                    <span className="text-slate-400" style={mono}>{count}</span>
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className={`h-full ${s === "Closed" ? "bg-emerald-500" : "bg-violet-500"}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/*  Issues list view                                                       */
/* ---------------------------------------------------------------------- */

function IssuesView({ issues, allCount, filters, setFilters, onOpen, onStatusChange, perms }) {
  return (
    <div className="space-y-4 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900" style={heading}>Issues</h1>
          <p className="text-sm text-slate-500 mt-1">{issues.length} of {allCount} issues</p>
        </div>
        <button
          onClick={() => exportCSV(issues, "bugflow-issues.csv")}
          className="flex items-center gap-1.5 text-sm border border-slate-200 hover:border-slate-300 bg-white px-3 py-2 rounded-lg text-slate-600 font-medium"
        >
          <Download className="w-3.5 h-3.5" /> Export CSV
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        <Select value={filters.severity} onChange={(v) => setFilters((f) => ({ ...f, severity: v }))} options={["All", ...SEVERITIES]} className="w-36" />
        <Select value={filters.status} onChange={(v) => setFilters((f) => ({ ...f, status: v }))} options={["All", ...STATUSES]} className="w-40" />
        <Select value={filters.module} onChange={(v) => setFilters((f) => ({ ...f, module: v }))} options={["All", ...MODULES]} className="w-48" />
        <Select value={filters.project} onChange={(v) => setFilters((f) => ({ ...f, project: v }))} options={["All", ...PROJECTS]} className="w-48" />
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs text-slate-400 uppercase tracking-wide">
              <th className="px-4 py-3 font-medium" style={mono}>ID</th>
              <th className="px-4 py-3 font-medium">Title</th>
              <th className="px-4 py-3 font-medium">Severity</th>
              <th className="px-4 py-3 font-medium">Priority</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Module</th>
              <th className="px-4 py-3 font-medium">Assignee</th>
              <th className="px-4 py-3 font-medium">Updated</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {issues.map((i) => (
              <tr key={i.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-4 py-3 text-slate-400 cursor-pointer" style={mono} onClick={() => onOpen(i.id)}>{i.id}</td>
                <td className="px-4 py-3 cursor-pointer max-w-xs" onClick={() => onOpen(i.id)}>
                  <div className="text-slate-800 font-medium truncate">{i.title}</div>
                  {i.tags.length > 0 && (
                    <div className="flex gap-1 mt-1">
                      {i.tags.slice(0, 3).map((t) => (
                        <span key={t} className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded" style={mono}>{t}</span>
                      ))}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3"><SeverityBadge severity={i.severity} /></td>
                <td className="px-4 py-3"><PriorityChip priority={i.priority} /></td>
                <td className="px-4 py-3">
                  {perms.editStatus ? (
                    <select
                      value={i.status}
                      onChange={(e) => onStatusChange(i.id, e.target.value)}
                      className="text-xs border border-slate-200 rounded-md px-1.5 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-violet-400"
                    >
                      {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  ) : (
                    <span className="text-xs text-slate-600">{i.status}</span>
                  )}
                  <div className="mt-1.5"><PipelineTrace status={i.status} /></div>
                </td>
                <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{i.module}</td>
                <td className="px-4 py-3"><div className="flex items-center gap-1.5"><Avatar name={i.assignee} /><span className="text-slate-500 text-xs hidden lg:inline">{i.assignee}</span></div></td>
                <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap" style={mono}>{fmtDate(i.updatedAt)}</td>
              </tr>
            ))}
            {issues.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-12 text-center text-slate-400 text-sm">No issues match these filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/*  Sprint / Kanban board                                                  */
/* ---------------------------------------------------------------------- */

function BoardView({ issues, onOpen, onMove, perms }) {
  const backlog = issues.filter((i) => !i.inSprint);
  const inSprint = issues.filter((i) => i.inSprint && !["Resolved", "Closed"].includes(i.status));
  const done = issues.filter((i) => i.inSprint && ["Resolved", "Closed"].includes(i.status));
  const total = inSprint.length + done.length;
  const completion = total ? Math.round((done.length / total) * 100) : 0;

  const columns = [
    { key: "backlog", label: "Backlog", items: backlog, next: "sprint", nextLabel: "Pull into sprint" },
    { key: "sprint", label: "In Sprint", items: inSprint, next: "done", nextLabel: "Mark done" },
    { key: "done", label: "Done", items: done, next: null, nextLabel: null },
  ];

  function handleDrop(e, colKey) {
    e.preventDefault();
    if (!perms.dragCards) return;
    const id = e.dataTransfer.getData("text/plain");
    onMove(id, colKey);
  }

  return (
    <div className="space-y-5 max-w-6xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900" style={heading}>{SPRINT_NAME}</h1>
          <p className="text-sm text-slate-500 mt-1">{SPRINT_RANGE}{!perms.dragCards && " · view only for your role"}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex items-center gap-5">
          <div>
            <div className="text-[11px] text-slate-400" style={mono}>Completion</div>
            <div className="text-lg font-semibold text-violet-600" style={heading}>{completion}%</div>
          </div>
          <div className="w-32 h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-violet-500" style={{ width: `${completion}%` }} />
          </div>
          <div>
            <div className="text-[11px] text-slate-400" style={mono}>Velocity</div>
            <div className="text-lg font-semibold text-slate-800" style={heading}>{done.length} <span className="text-xs text-slate-400 font-normal">done</span></div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {columns.map((col) => (
          <div
            key={col.key}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => handleDrop(e, col.key)}
            className="bg-slate-100/70 rounded-xl p-3 min-h-[400px]"
          >
            <div className="flex items-center justify-between px-1.5 pb-2 mb-1">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide" style={mono}>{col.label}</span>
              <span className="text-xs text-slate-400 bg-white rounded-full px-2 py-0.5">{col.items.length}</span>
            </div>
            <div className="space-y-2">
              {col.items.map((i) => (
                <div
                  key={i.id}
                  draggable={perms.dragCards}
                  onDragStart={(e) => e.dataTransfer.setData("text/plain", i.id)}
                  onClick={() => onOpen(i.id)}
                  className={`bg-white rounded-lg p-3 border border-slate-200 hover:border-violet-300 transition-colors ${perms.dragCards ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"}`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] text-slate-400" style={mono}>{i.id}</span>
                    <SeverityBadge severity={i.severity} />
                  </div>
                  <div className="text-sm text-slate-800 font-medium leading-snug mb-2">{i.title}</div>
                  <div className="flex items-center justify-between">
                    <Avatar name={i.assignee} />
                    {perms.dragCards && col.next && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onMove(i.id, col.next); }}
                        title={col.nextLabel}
                        className="text-slate-300 hover:text-violet-500 transition-colors"
                      >
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {col.items.length === 0 && <div className="text-xs text-slate-400 text-center py-8">Nothing here</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/*  Milestone 2 — Workflow & Collaboration                                 */
/* ---------------------------------------------------------------------- */

function WorkflowCollaborationView({ issues, perms, role, onOpen, onStatusChange }) {
  const [sprints, setSprints] = useState([]);
  const [backlog, setBacklog] = useState([]);
  const [feed, setFeed] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNewSprint, setShowNewSprint] = useState(false);
  const [newSprintName, setNewSprintName] = useState("");
  const [newSprintGoal, setNewSprintGoal] = useState("");
  const [newSprintStart, setNewSprintStart] = useState("");
  const [newSprintEnd, setNewSprintEnd] = useState("");
  const printRef = React.useRef(null);

  const refresh = useCallback(async () => {
    try {
      const [s, b, f] = await Promise.all([api.listSprints(), api.backlog(), api.recentActivity(25)]);
      setSprints(s);
      setBacklog(b);
      setFeed(f);
    } catch {
      /* silently ignore — this tab is secondary to the main issue views */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const activeIssues = useMemo(() => issues.filter((i) => i.status !== "Closed"), [issues]);

  async function handleCreateSprint() {
    if (!newSprintName.trim()) return;
    await api.createSprint({ name: newSprintName.trim(), goal: newSprintGoal.trim(), startDate: newSprintStart || null, endDate: newSprintEnd || null });
    setNewSprintName(""); setNewSprintGoal(""); setNewSprintStart(""); setNewSprintEnd("");
    setShowNewSprint(false);
    refresh();
  }

  async function handleMarkCompleted(sprintId) {
    await api.updateSprint(sprintId, { status: "COMPLETED" });
    refresh();
  }

  async function handleAddToSprint(sprintId, issueId) {
    await api.addIssueToSprint(sprintId, issueId);
    refresh();
  }

  function handleGeneratePdf() {
    window.print();
  }

  return (
    <div className="space-y-6" id="workflow-print-root" ref={printRef}>
      <div className="flex items-center justify-between print:hidden">
        <div>
          <h1 className="text-2xl font-bold text-slate-900" style={heading}>Workflow & Collaboration</h1>
          <p className="text-sm text-slate-500 mt-1">Status pipeline, live activity, and sprint/backlog planning.</p>
        </div>
        <button
          onClick={handleGeneratePdf}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium bg-slate-800 hover:bg-slate-900 text-white"
        >
          <FileDown className="w-4 h-4" /> Generate PDF Report
        </button>
      </div>

      {/* Workflow Card */}
      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3" style={mono}>
          <Workflow className="w-3.5 h-3.5" /> Workflow
        </div>
        <div className="space-y-1.5 max-h-72 overflow-y-auto">
          {activeIssues.map((issue) => (
            <div key={issue.id} className="flex items-center justify-between gap-3 text-sm py-1.5 px-2 rounded-lg hover:bg-slate-50">
              <button onClick={() => onOpen(issue.id)} className="flex items-center gap-2 flex-1 min-w-0 text-left">
                <span className="text-xs text-slate-400 shrink-0" style={mono}>{issue.id}</span>
                <span className="truncate text-slate-700">{issue.title}</span>
              </button>
              <SeverityBadge severity={issue.severity} />
              {perms.editStatus ? (
                <Select value={issue.status} onChange={(v) => onStatusChange(issue.id, v)} options={STATUSES} className="w-36" />
              ) : (
                <span className="text-xs text-slate-500 px-2">{issue.status}</span>
              )}
            </div>
          ))}
          {activeIssues.length === 0 && <div className="text-xs text-slate-400 text-center py-6">No active issues</div>}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Live Activity Stream */}
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3" style={mono}>
            <Rss className="w-3.5 h-3.5" /> Live Activity Stream
          </div>
          <div className="space-y-2.5 max-h-96 overflow-y-auto">
            {feed.map((a) => (
              <div key={a.id} className="text-sm">
                <span className="text-slate-600">
                  <span className="font-medium">{a.actor || "System"}</span> {describeActivity(a)}{" "}
                  <button onClick={() => onOpen(a.issueId)} className="text-violet-600 hover:underline" style={mono}>{a.issueId}</button>
                </span>
                <div className="text-[10px] text-slate-300" style={mono}>{fmtRelativeTime(a.at)}</div>
              </div>
            ))}
            {feed.length === 0 && !loading && <div className="text-xs text-slate-400 text-center py-6">No recent activity</div>}
          </div>
        </div>

        {/* Sprint Board v2: Active Sprints + Backlog */}
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wide" style={mono}>
              <ArrowLeftRight className="w-3.5 h-3.5" /> Sprints & Backlog
            </div>
            {perms.manageSprint && (
              <button onClick={() => setShowNewSprint((v) => !v)} className="text-xs font-medium text-violet-600 hover:text-violet-700">
                + New Sprint
              </button>
            )}
          </div>

          {showNewSprint && (
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 mb-3 space-y-2">
              <input value={newSprintName} onChange={(e) => setNewSprintName(e.target.value)} placeholder="Sprint name (e.g. Sprint 2)"
                className="w-full border border-slate-200 rounded-md px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400" />
              <input value={newSprintGoal} onChange={(e) => setNewSprintGoal(e.target.value)} placeholder="Goal"
                className="w-full border border-slate-200 rounded-md px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400" />
              <div className="flex gap-2">
                <input type="date" value={newSprintStart} onChange={(e) => setNewSprintStart(e.target.value)}
                  className="flex-1 border border-slate-200 rounded-md px-2.5 py-1.5 text-sm" />
                <input type="date" value={newSprintEnd} onChange={(e) => setNewSprintEnd(e.target.value)}
                  className="flex-1 border border-slate-200 rounded-md px-2.5 py-1.5 text-sm" />
              </div>
              <button onClick={handleCreateSprint} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-violet-600 hover:bg-violet-700 text-white">
                Create Sprint
              </button>
            </div>
          )}

          <div className="text-xs font-medium text-slate-400 mb-1.5">Active / Planning Sprints</div>
          <div className="space-y-2.5 mb-4">
            {sprints.map((s) => (
              <div key={s.id} className="border border-slate-200 rounded-lg p-2.5">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-slate-700">{s.name}</div>
                    <div className="text-xs text-slate-400">{s.goal}</div>
                  </div>
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                    s.status === "COMPLETED" ? "bg-emerald-50 text-emerald-600" : s.status === "ACTIVE" ? "bg-violet-50 text-violet-600" : "bg-slate-100 text-slate-500"
                  }`}>{s.status}</span>
                </div>
                <div className="mt-2">
                  <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1">
                    <span>{s.completedCount}/{s.issuesCount} done</span>
                    <span>{s.velocity != null ? `Velocity: ${s.velocity}` : `${s.completionPct}%`}</span>
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-violet-500" style={{ width: `${s.completionPct}%` }} />
                  </div>
                </div>
                {perms.manageSprint && s.status !== "COMPLETED" && (
                  <button onClick={() => handleMarkCompleted(s.id)} className="mt-2 text-[11px] font-medium text-emerald-600 hover:text-emerald-700">
                    Mark Completed
                  </button>
                )}
              </div>
            ))}
            {sprints.length === 0 && <div className="text-xs text-slate-400 py-2">No sprints yet</div>}
          </div>

          <div className="text-xs font-medium text-slate-400 mb-1.5">Backlog</div>
          <div className="space-y-1.5 max-h-56 overflow-y-auto">
            {backlog.map((b) => (
              <div key={b.id} className="flex items-center justify-between gap-2 text-sm py-1.5 px-2 rounded-lg hover:bg-slate-50">
                <button onClick={() => onOpen(b.id)} className="flex items-center gap-2 flex-1 min-w-0 text-left">
                  <SeverityBadge severity={b.severity} />
                  <span className="truncate text-slate-700">{b.title}</span>
                </button>
                {perms.manageSprint && sprints.length > 0 && (
                  <select
                    onChange={(e) => { if (e.target.value) handleAddToSprint(e.target.value, b.id); e.target.value = ""; }}
                    defaultValue=""
                    className="text-xs border border-slate-200 rounded-md px-1.5 py-1 focus:outline-none"
                  >
                    <option value="" disabled>+ Add to Sprint</option>
                    {sprints.filter((s) => s.status !== "COMPLETED").map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                )}
              </div>
            ))}
            {backlog.length === 0 && <div className="text-xs text-slate-400 text-center py-4">Backlog is empty</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

function describeActivity(a) {
  if (a.type === "assign") return `assigned ${a.newValue || ""}`.trim() + " on";
  if (a.type === "comment") return "commented on";
  if (a.type === "attachment") return "attached a file to";
  if (a.type === "sprint") return "updated the sprint for";
  if (a.type === "status") return `changed status${a.oldValue && a.newValue ? ` (${a.oldValue} → ${a.newValue})` : ""} on`;
  if (a.type === "created") return "reported";
  return "updated";
}

function fmtRelativeTime(iso) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

/* ---------------------------------------------------------------------- */
/*  Sprint Analysis — burndown, velocity trend, sprint comparison           */
/* ---------------------------------------------------------------------- */

function SprintAnalysisView({ issues }) {
  const [sprints, setSprints] = useState([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setSprints(await api.listSprints());
    } catch {
      /* secondary view — fail quietly */
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  // Velocity trend across every completed sprint, oldest first.
  const velocityTrend = useMemo(() => {
    return [...sprints]
      .filter((s) => s.status === "COMPLETED")
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
      .map((s) => ({ name: s.name, Velocity: s.velocity ?? s.completedCount }));
  }, [sprints]);

  // Burndown for the most recent active (or most recently updated) sprint:
  // ideal line vs. remaining open issues in that sprint, day by day.
  const activeSprint = sprints.find((s) => s.status === "ACTIVE") || sprints[0];
  const burndown = useMemo(() => {
    if (!activeSprint?.startDate || !activeSprint?.endDate) return [];
    const start = new Date(activeSprint.startDate);
    const end = new Date(activeSprint.endDate);
    const totalDays = Math.max(1, Math.round((end - start) / 86400000));
    const sprintIssues = issues.filter((i) => i.sprintId === activeSprint.id);
    const total = sprintIssues.length;
    const points = [];
    for (let d = 0; d <= totalDays; d++) {
      const day = new Date(start); day.setDate(day.getDate() + d);
      const remaining = sprintIssues.filter((i) => {
        const done = i.resolvedAt && new Date(i.resolvedAt) <= day;
        return !done;
      }).length;
      const ideal = Math.max(0, Math.round(total - (total / totalDays) * d));
      points.push({ day: fmtDate(day.toISOString()), Remaining: remaining, Ideal: ideal });
    }
    return points;
  }, [activeSprint, issues]);

  if (loading) {
    return <div className="text-sm text-slate-400 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading sprint analysis…</div>;
  }

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900" style={heading}>Sprint Analysis</h1>
        <p className="text-sm text-slate-500 mt-1">Burndown, velocity trend, and sprint-by-sprint comparison.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <h2 className="font-medium text-slate-800 mb-1" style={heading}>Burndown{activeSprint ? ` — ${activeSprint.name}` : ""}</h2>
          <p className="text-xs text-slate-400 mb-4">Remaining issues vs. an ideal straight-line pace.</p>
          {burndown.length > 0 ? (
            <div style={{ height: 240 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={burndown}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="day" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={{ stroke: "#e2e8f0" }} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="Ideal" stroke="#cbd5e1" strokeWidth={2} strokeDasharray="4 4" dot={false} />
                  <Line type="monotone" dataKey="Remaining" stroke="#7c3aed" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="text-xs text-slate-400 text-center py-16">No sprint with start/end dates to chart yet.</div>
          )}
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <h2 className="font-medium text-slate-800 mb-1" style={heading}>Velocity trend</h2>
          <p className="text-xs text-slate-400 mb-4">Issues completed per finished sprint.</p>
          {velocityTrend.length > 0 ? (
            <div style={{ height: 240 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={velocityTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={{ stroke: "#e2e8f0" }} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }} />
                  <Bar dataKey="Velocity" fill="#14b8a6" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="text-xs text-slate-400 text-center py-16">No completed sprints yet.</div>
          )}
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="font-medium text-slate-800" style={heading}>Sprint comparison</h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-400 text-xs uppercase tracking-wide border-b border-slate-100">
              <th className="px-5 py-3 font-medium">Sprint</th>
              <th className="px-5 py-3 font-medium">Status</th>
              <th className="px-5 py-3 font-medium">Planned</th>
              <th className="px-5 py-3 font-medium">Completed</th>
              <th className="px-5 py-3 font-medium">Completion</th>
              <th className="px-5 py-3 font-medium">Velocity</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sprints.map((s) => (
              <tr key={s.id} className="hover:bg-slate-50">
                <td className="px-5 py-3 font-medium text-slate-700">{s.name}</td>
                <td className="px-5 py-3">
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                    s.status === "COMPLETED" ? "bg-emerald-50 text-emerald-600" : s.status === "ACTIVE" ? "bg-violet-50 text-violet-600" : "bg-slate-100 text-slate-500"
                  }`}>{s.status}</span>
                </td>
                <td className="px-5 py-3 text-slate-500" style={mono}>{s.issuesCount}</td>
                <td className="px-5 py-3 text-slate-500" style={mono}>{s.completedCount}</td>
                <td className="px-5 py-3 text-slate-500" style={mono}>{s.completionPct}%</td>
                <td className="px-5 py-3 text-slate-500" style={mono}>{s.velocity ?? "—"}</td>
              </tr>
            ))}
            {sprints.length === 0 && (
              <tr><td colSpan={6} className="px-5 py-10 text-center text-slate-400 text-sm">No sprints yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/*  Analytics dashboard                                                    */
/* ---------------------------------------------------------------------- */

function AnalyticsView({ issues }) {
  const resolved = issues.filter((i) => i.resolvedAt);
  const closedOrResolved = issues.filter((i) => ["Resolved", "Closed"].includes(i.status));
  const fixRate = issues.length ? Math.round((closedOrResolved.length / issues.length) * 100) : 0;
  const avgFixDays = resolved.length ? (resolved.reduce((s, i) => s + daysBetween(i.createdAt, i.resolvedAt), 0) / resolved.length).toFixed(1) : "—";
  const openCount = issues.length - closedOrResolved.length;

  const trendData = useMemo(() => {
    const days = [];
    for (let d = 20; d >= 0; d -= 3) {
      const dateLabel = fmtDate(offsetDate(d));
      const dateVal = offsetDate(d);
      const reported = issues.filter((i) => daysBetween(i.createdAt, dateVal) >= 0 && daysBetween(i.createdAt, dateVal) < 3 + (d === 20 ? 999 : 0) && new Date(i.createdAt) <= new Date(dateVal) && new Date(i.createdAt) > new Date(offsetDate(d + 3))).length;
      const fixed = issues.filter((i) => i.resolvedAt && new Date(i.resolvedAt) <= new Date(dateVal) && new Date(i.resolvedAt) > new Date(offsetDate(d + 3))).length;
      days.push({ date: dateLabel, Reported: reported, Resolved: fixed });
    }
    return days;
  }, [issues]);

  const severityData = SEVERITIES.map((s) => ({ severity: s, count: issues.filter((i) => i.severity === s).length }));
  const sevColor = { Low: "#10b981", Medium: "#f59e0b", High: "#f97316", Critical: "#e11d48" };

  const resolutionBySeverity = SEVERITIES.map((s) => {
    const items = resolved.filter((i) => i.severity === s);
    const avg = items.length ? items.reduce((sum, i) => sum + daysBetween(i.createdAt, i.resolvedAt), 0) / items.length : 0;
    return { severity: s, days: Number(avg.toFixed(1)) };
  });

  const productivity = TEAM.map((name) => ({ name: name.split(" ")[0], resolved: issues.filter((i) => i.assignee === name && ["Resolved", "Closed"].includes(i.status)).length }));

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900" style={heading}>Analytics</h1>
          <p className="text-sm text-slate-500 mt-1">Defect trends, resolution speed, and team output.</p>
        </div>
        <button
          onClick={() => exportCSV(issues, "bugflow-analytics-export.csv")}
          className="flex items-center gap-1.5 text-sm border border-slate-200 hover:border-slate-300 bg-white px-3 py-2 rounded-lg text-slate-600 font-medium"
        >
          <Download className="w-3.5 h-3.5" /> Export CSV
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Bug fix rate", value: `${fixRate}%`, tone: "text-emerald-600" },
          { label: "Avg fix time", value: `${avgFixDays}d`, tone: "text-violet-600" },
          { label: "Open issues", value: openCount, tone: "text-orange-600" },
          { label: "Closed issues", value: closedOrResolved.length, tone: "text-slate-800" },
        ].map((c) => (
          <div key={c.label} className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="text-xs text-slate-500 mb-1.5">{c.label}</div>
            <div className={`text-3xl font-semibold ${c.tone}`} style={heading}>{c.value}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <h2 className="font-medium text-slate-800 mb-4" style={heading}>Defect trend</h2>
          <div style={{ height: 240 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={{ stroke: "#e2e8f0" }} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="Reported" stroke="#f97316" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="Resolved" stroke="#7c3aed" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <h2 className="font-medium text-slate-800 mb-4" style={heading}>Issues by severity</h2>
          <div style={{ height: 240 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={severityData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="severity" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={{ stroke: "#e2e8f0" }} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }} />
                <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                  {severityData.map((d) => <Cell key={d.severity} fill={sevColor[d.severity]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <h2 className="font-medium text-slate-800 mb-4" style={heading}>Avg resolution time by severity (days)</h2>
          <div style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={resolutionBySeverity}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="severity" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={{ stroke: "#e2e8f0" }} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }} />
                <Bar dataKey="days" fill="#7c3aed" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <h2 className="font-medium text-slate-800 mb-4" style={heading}>Team productivity (resolved)</h2>
          <div style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={productivity}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={{ stroke: "#e2e8f0" }} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }} />
                <Bar dataKey="resolved" fill="#14b8a6" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/*  Milestone 4 — Optimization & Finalization                              */
/* ---------------------------------------------------------------------- */

function KpiBox({ label, value, sub, tone }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <div className="text-xs text-slate-500 mb-1.5">{label}</div>
      <div className={`text-3xl font-semibold ${tone}`} style={heading}>{value}</div>
      {sub && <div className="text-[11px] text-slate-400 mt-1">{sub}</div>}
    </div>
  );
}

function ChecklistRow({ ok, label }) {
  return (
    <div className="flex items-center gap-2 text-sm py-1.5">
      {ok ? <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" /> : <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />}
      <span className={ok ? "text-slate-700" : "text-slate-500"}>{label}</span>
    </div>
  );
}

function Milestone4View({ issues }) {
  const [workload, setWorkload] = useState(null);
  const [perf, setPerf] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [published, setPublished] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([api.developerWorkload(), api.systemPerformance()])
      .then(([w, p]) => {
        if (cancelled) return;
        setWorkload(w);
        setPerf(p);
        setError("");
      })
      .catch((err) => { if (!cancelled) setError(err.message || "Failed to load Milestone 4 analytics"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [issues.length]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500 py-12 justify-center">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading optimization &amp; scale metrics…
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-lg mx-auto text-center py-12">
        <AlertTriangle className="w-6 h-6 text-amber-500 mx-auto mb-2" />
        <p className="text-sm text-slate-600">{error}</p>
        <p className="text-xs text-slate-400 mt-1">This tab needs an Admin or Project Manager session and a running API.</p>
      </div>
    );
  }

  const { kpis, scale, database } = perf;
  const { developers, resourceBalance } = workload;

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 flex items-center gap-2" style={heading}>
            <Rocket className="w-5 h-5 text-violet-500" /> Milestone 4: Optimization &amp; Finalization
          </h1>
          <p className="text-sm text-slate-500 mt-1">Scale-readiness, database performance, and team workload balance.</p>
        </div>
      </div>

      {/* Top 4 KPI metric boxes */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiBox label="Bug Fix Rate" value={`${kpis.bugFixRatePct}%`} sub="Resolved & Closed" tone="text-emerald-600" />
        <KpiBox
          label="Average Fix Time (MTTR)"
          value={kpis.avgFixTimeDays != null ? `${kpis.avgFixTimeDays}d` : "—"}
          sub="Turnaround speed"
          tone="text-violet-600"
        />
        <KpiBox label="Backlog Health Score" value={`${kpis.backlogHealthScore} / 100`} sub={kpis.backlogHealthScore >= 80 ? "Optimal" : "Needs attention"} tone="text-teal-600" />
        <KpiBox label="Defect Leakage Rate" value={`${kpis.defectLeakageRatePct}%`} sub="Production escapes" tone="text-orange-600" />
      </div>

      {/* System scale & performance card */}
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <h2 className="font-medium text-slate-800 mb-4 flex items-center gap-2" style={heading}>
          <Gauge className="w-4 h-4 text-slate-400" /> System Scale &amp; Performance
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
          <div>
            <div className="text-slate-400 text-xs mb-1">Max DB Pool</div>
            <div className="font-semibold text-slate-800" style={mono}>{database.max} active capacity</div>
            <div className="text-[11px] text-slate-400 mt-0.5">{database.totalCount} in use · {database.idleCount} idle · {database.waitingCount} waiting</div>
          </div>
          <div>
            <div className="text-slate-400 text-xs mb-1">Avg Response Time</div>
            <div className="font-semibold text-slate-800" style={mono}>
              {scale.avgResponseTimeMs != null ? `${scale.avgResponseTimeMs}ms` : "—"} <span className="text-slate-400 font-normal">(Target: &lt; {scale.targetResponseTimeMs}ms)</span>
            </div>
          </div>
          <div>
            <div className="text-slate-400 text-xs mb-1">Stress Capacity</div>
            <div className="font-semibold text-slate-800" style={mono}>{scale.scaleTarget.toLocaleString()}+ issues</div>
            <div className="text-[11px] text-slate-400 mt-0.5">{scale.issueCount.toLocaleString()} currently tracked</div>
          </div>
        </div>
      </div>

      {/* Database performance checklist */}
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <h2 className="font-medium text-slate-800 mb-2 flex items-center gap-2" style={heading}>
          <Database className="w-4 h-4 text-slate-400" /> Database Performance Checklist
        </h2>
        <ChecklistRow ok={database.compositeIndexesActive} label="PostgreSQL Composite Indexes Active (project+status, assignee+status, created_at)" />
        <ChecklistRow ok={database.connectionPoolingEnabled} label={`Connection Pooling Enabled (pool max ${database.max})`} />
        <ChecklistRow ok={true} label="Role-Based Access Control Enforced (JWT auth + bcrypt password hashing)" />
      </div>

      {/* Developer productivity matrix */}
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-medium text-slate-800 flex items-center gap-2" style={heading}>
            <Users className="w-4 h-4 text-slate-400" /> Developer Productivity Matrix
          </h2>
          {resourceBalance.imbalanced && (
            <span className="text-xs text-amber-600 flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5" /> Workload spread of {resourceBalance.spread} active tasks — consider reassigning
            </span>
          )}
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-400 text-xs uppercase tracking-wide border-b border-slate-100">
              <th className="pb-2 font-medium">Developer</th>
              <th className="pb-2 font-medium">Team</th>
              <th className="pb-2 font-medium text-right">Active Tasks</th>
              <th className="pb-2 font-medium text-right">Completed Fixes</th>
              <th className="pb-2 font-medium text-right">Avg MTTR</th>
            </tr>
          </thead>
          <tbody>
            {developers.map((d) => (
              <tr key={d.id} className="border-b border-slate-50 last:border-0">
                <td className="py-2 text-slate-800 font-medium">{d.developer}</td>
                <td className="py-2 text-slate-500">{d.team}</td>
                <td className="py-2 text-right" style={mono}>{d.activeTasks}</td>
                <td className="py-2 text-right" style={mono}>{d.completedFixes}</td>
                <td className="py-2 text-right" style={mono}>{d.avgMttrHours != null ? `${d.avgMttrHours}h` : "—"}</td>
              </tr>
            ))}
            {developers.length === 0 && (
              <tr><td colSpan={5} className="py-6 text-center text-slate-400">No active developer accounts yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Publish documentation */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-medium text-slate-800 flex items-center gap-2" style={heading}>
            <BookOpen className="w-4 h-4 text-slate-400" /> Documentation &amp; Guides
          </h2>
          <p className="text-xs text-slate-500 mt-1">Interactive API reference, plus the project README with setup and Docker instructions.</p>
        </div>
        <button
          onClick={() => setPublished(true)}
          className="flex items-center gap-1.5 bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium px-3.5 py-2 rounded-lg transition-colors"
        >
          <Send className="w-4 h-4" /> Publish All Documentation &amp; Guides
        </button>
      </div>
      {published && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-sm text-emerald-800 flex flex-wrap items-center gap-x-2 gap-y-1">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          Published. Open{" "}
          <a href="/docs" target="_blank" rel="noreferrer" className="underline font-medium">/docs</a>
          {" "}for the interactive Swagger reference, or{" "}
          <span className="font-medium">/README.md</span>{" "}in the project root for setup and Docker instructions.
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/*  Admin overview                                                         */
/* ---------------------------------------------------------------------- */

function AdminView({ issues, onGo, setFilters }) {
  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900" style={heading}>Admin Overview</h1>
        <p className="text-sm text-slate-500 mt-1">All projects at a glance.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {PROJECTS.map((p) => {
          const items = issues.filter((i) => i.project === p);
          const open = items.filter((i) => !["Resolved", "Closed"].includes(i.status));
          const critical = items.filter((i) => i.severity === "Critical" && i.status !== "Closed");
          const closed = items.filter((i) => ["Resolved", "Closed"].includes(i.status));
          const completion = items.length ? Math.round((closed.length / items.length) * 100) : 0;
          return (
            <div key={p} className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h2 className="font-semibold text-slate-800" style={heading}>{p}</h2>
                  <p className="text-xs text-slate-400 mt-0.5" style={mono}>{items.length} issues</p>
                </div>
                <ShieldCheck className="w-4 h-4 text-slate-300" />
              </div>
              <div className="space-y-2 mb-4">
                <div className="flex justify-between text-sm"><span className="text-slate-500">Open</span><span className="font-medium text-slate-700">{open.length}</span></div>
                <div className="flex justify-between text-sm"><span className="text-slate-500">Critical (active)</span><span className="font-medium text-rose-600">{critical.length}</span></div>
                <div className="flex justify-between text-sm"><span className="text-slate-500">Closed</span><span className="font-medium text-emerald-600">{closed.length}</span></div>
              </div>
              <div className="flex items-center gap-2 mb-4">
                <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-violet-500" style={{ width: `${completion}%` }} />
                </div>
                <span className="text-xs text-slate-400" style={mono}>{completion}%</span>
              </div>
              <button
                onClick={() => { setFilters((f) => ({ ...f, project: p })); onGo("issues"); }}
                className="text-xs text-violet-600 hover:text-violet-700 font-medium flex items-center gap-1"
              >
                View issues <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          );
        })}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <h2 className="font-medium text-slate-800 mb-4" style={heading}>Assignee workload</h2>
        <div className="space-y-3">
          {TEAM.map((name) => {
            const open = issues.filter((i) => i.assignee === name && !["Resolved", "Closed"].includes(i.status)).length;
            const total = issues.filter((i) => i.assignee === name).length;
            return (
              <div key={name} className="flex items-center gap-3">
                <Avatar name={name} />
                <span className="text-sm text-slate-700 w-32">{name}</span>
                <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-teal-500" style={{ width: `${total ? (open / total) * 100 : 0}%` }} />
                </div>
                <span className="text-xs text-slate-400 w-20 text-right" style={mono}>{open} open / {total}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/*  Settings — role-specific workflow panel                                */
/* ---------------------------------------------------------------------- */

function dueStatus(dueDate, resolved) {
  if (!dueDate) return null;
  if (resolved) return { label: `Due ${fmtDate(dueDate)}`, tone: "text-slate-400" };
  const days = Math.ceil((new Date(dueDate) - new Date()) / 86400000);
  if (days < 0) return { label: `Overdue by ${Math.abs(days)}d`, tone: "text-rose-600 font-medium" };
  if (days === 0) return { label: "Due today", tone: "text-orange-600 font-medium" };
  return { label: `Due in ${days}d`, tone: "text-slate-500" };
}

function AssignTimelinePanel({ issue, users, onAssign }) {
  const assignable = users.filter((u) => ["Developer", "Tester", "Project Manager"].includes(u.role));
  const [assignee, setAssignee] = useState(issue.assignee !== "Unassigned" ? issue.assignee : "");
  const [dueDate, setDueDate] = useState(issue.dueDate ? issue.dueDate.slice(0, 10) : "");

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={assignee}
        onChange={setAssignee}
        options={[{ value: "", label: "Assign to…" }, ...assignable.map((u) => ({ value: u.displayName, label: `${u.displayName} (${u.role})` }))]}
        className="w-52"
      />
      <input
        type="date"
        value={dueDate}
        onChange={(e) => setDueDate(e.target.value)}
        className="border border-slate-200 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
      />
      <button
        disabled={!assignee}
        onClick={() => onAssign(issue.id, assignee, dueDate || null)}
        className="px-3 py-2 rounded-lg text-xs font-medium bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white"
      >
        Set timeline
      </button>
    </div>
  );
}

/* Assignee -> Admin: write up what was done and submit the resolution report. */
function SubmitReportForm({ issue, onSubmit }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1 text-xs font-medium text-violet-600 hover:text-violet-700 shrink-0"
      >
        <Send className="w-3.5 h-3.5" /> Submit report to Admin
      </button>
    );
  }

  return (
    <div className="mt-2 bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2">
      <label className="text-xs font-medium text-slate-500 block">
        What did you do to resolve {issue.id}? This goes straight to the Admin for review.
      </label>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        placeholder="e.g. Root cause was a missing null check in the export handler. Patched it, added a regression test, verified on staging…"
        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-violet-400"
      />
      <div className="flex justify-end gap-2">
        <button onClick={() => { setOpen(false); setText(""); }} className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-500 hover:bg-slate-100">
          Cancel
        </button>
        <button
          disabled={!text.trim() || submitting}
          onClick={async () => {
            setSubmitting(true);
            await onSubmit(issue.id, text);
            setSubmitting(false);
            setOpen(false);
            setText("");
          }}
          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white"
        >
          {submitting ? "Sending…" : "Send to Admin"}
        </button>
      </div>
    </div>
  );
}

/* Admin: review a submitted resolution report, then send an update to the reporter. */
function AdminReviewCard({ issue, onOpen, onSendUpdate }) {
  const [message, setMessage] = useState(
    `Hi ${issue.reporter.split(" ")[0]}, your issue "${issue.title}" (${issue.id}) has been resolved. `
  );
  const [sending, setSending] = useState(false);

  return (
    <div className="border border-slate-200 rounded-lg p-3 space-y-2">
      <button onClick={() => onOpen(issue.id)} className="text-left w-full">
        <div className="text-sm text-slate-800 font-medium">{issue.title}</div>
        <div className="text-xs text-slate-400 mt-0.5" style={mono}>
          {issue.id} · resolved by {issue.assignee} · reported by {issue.reporter}
        </div>
      </button>
      <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1">
          {issue.assignee}'s resolution report
        </div>
        <p className="text-sm text-slate-700 whitespace-pre-wrap">{issue.resolutionReport}</p>
      </div>
      <div>
        <label className="text-xs font-medium text-slate-500 mb-1 block">Message to send {issue.reporter}</label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={2}
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-violet-400"
        />
      </div>
      <div className="flex justify-end">
        <button
          disabled={!message.trim() || sending}
          onClick={async () => {
            setSending(true);
            await onSendUpdate(issue.id, message);
            setSending(false);
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white"
        >
          <Send className="w-3.5 h-3.5" /> {sending ? "Sending…" : "Send update to reporter"}
        </button>
      </div>
    </div>
  );
}

function SettingsView({ role, user, issues, users, onAssign, onOpen, notifications, onMarkAllRead, onSubmitReport, onSendUpdate }) {
  const [reportIssue, setReportIssue] = useState(null);

  useEffect(() => {
    if (reportIssue) {
      const t = setTimeout(() => window.print(), 50);
      return () => clearTimeout(t);
    }
  }, [reportIssue]);

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="print:hidden">
        <h1 className="text-2xl font-semibold text-slate-900" style={heading}>Settings</h1>
        <p className="text-sm text-slate-500 mt-1">Workflow settings for your role — <span className="font-medium text-slate-700">{role}</span>.</p>
      </div>

      {/* ---- User: reporting-only role ---- */}
      {role === "User" && (
        <div className="print:hidden space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <h2 className="font-medium text-slate-800 mb-1" style={heading}>My reported issues</h2>
            <p className="text-xs text-slate-400 mb-4">
              You'll get a notification here when an Admin assigns your issue and sets a timeline, and again once the Admin has reviewed the fix and sent you an update.
            </p>
            <div className="divide-y divide-slate-100">
              {issues.filter((i) => i.reporter === user.displayName).map((i) => {
                const ds = dueStatus(i.dueDate, ["Resolved", "Closed"].includes(i.status));
                return (
                  <div key={i.id} className="py-3">
                    <button onClick={() => onOpen(i.id)} className="w-full flex items-center justify-between gap-3 text-left hover:bg-slate-50 px-2 -mx-2 rounded-lg">
                      <div className="min-w-0">
                        <div className="text-sm text-slate-800 font-medium truncate">{i.title}</div>
                        <div className="text-xs text-slate-400 mt-0.5" style={mono}>{i.id} · {i.status} · assigned to {i.assignee}</div>
                      </div>
                      {ds && <span className={`text-xs shrink-0 ${ds.tone}`}>{ds.label}</span>}
                    </button>
                    {i.adminResponse && (
                      <div className="mt-2 ml-0 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700 mb-1 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> Update from Admin
                        </div>
                        <p className="text-sm text-emerald-900">{i.adminResponse}</p>
                      </div>
                    )}
                    {!i.adminResponse && ["Resolved", "Closed"].includes(i.status) && (
                      <div className="mt-2 text-xs text-slate-400 italic px-2">
                        Marked {i.status.toLowerCase()} — waiting on the Admin to review the resolution and send you an update.
                      </div>
                    )}
                  </div>
                );
              })}
              {issues.filter((i) => i.reporter === user.displayName).length === 0 && (
                <div className="text-xs text-slate-400 text-center py-6">You haven't reported any issues yet.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ---- Admin: assignment, timeline review & resolution reports ---- */}
      {role === "Admin" && (
        <div className="print:hidden space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <h2 className="font-medium text-slate-800 mb-1" style={heading}>Assign & set a timeline</h2>
            <p className="text-xs text-slate-400 mb-4">Triaged issues waiting on an owner and a resolution deadline.</p>
            <div className="space-y-3">
              {issues.filter((i) => i.status !== "Open" && i.assignee === "Unassigned").map((i) => (
                <div key={i.id} className="border border-slate-200 rounded-lg p-3">
                  <button onClick={() => onOpen(i.id)} className="text-left w-full mb-2">
                    <div className="text-sm text-slate-800 font-medium">{i.title}</div>
                    <div className="text-xs text-slate-400 mt-0.5" style={mono}>{i.id} · reported by {i.reporter}</div>
                  </button>
                  <AssignTimelinePanel issue={i} users={users} onAssign={onAssign} />
                </div>
              ))}
              {issues.filter((i) => i.status !== "Open" && i.assignee === "Unassigned").length === 0 && (
                <div className="text-xs text-slate-400 text-center py-6">Nothing waiting on assignment.</div>
              )}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-1">
              <h2 className="font-medium text-slate-800" style={heading}>Resolution reports awaiting review</h2>
              {issues.filter((i) => i.reportStatus === "submitted").length > 0 && (
                <span className="text-xs font-medium bg-violet-100 text-violet-700 rounded-full px-2 py-0.5">
                  {issues.filter((i) => i.reportStatus === "submitted").length}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 mb-4">
              The assignee has resolved these and sent a report. Review it, then send your own update to the reporter.
            </p>
            <div className="space-y-3">
              {issues.filter((i) => i.reportStatus === "submitted").map((i) => (
                <AdminReviewCard key={i.id} issue={i} onOpen={onOpen} onSendUpdate={onSendUpdate} />
              ))}
              {issues.filter((i) => i.reportStatus === "submitted").length === 0 && (
                <div className="text-xs text-slate-400 text-center py-6">Nothing waiting on review right now.</div>
              )}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <h2 className="font-medium text-slate-800 mb-1" style={heading}>Active timelines</h2>
            <p className="text-xs text-slate-400 mb-4">Assigned issues with a deadline, and how they're tracking.</p>
            <div className="divide-y divide-slate-100">
              {issues.filter((i) => i.dueDate && i.assignee !== "Unassigned").map((i) => {
                const ds = dueStatus(i.dueDate, ["Resolved", "Closed"].includes(i.status));
                return (
                  <button key={i.id} onClick={() => onOpen(i.id)} className="w-full flex items-center justify-between gap-3 py-3 text-left hover:bg-slate-50 px-2 -mx-2 rounded-lg">
                    <div className="min-w-0 flex items-center gap-2">
                      <Avatar name={i.assignee} />
                      <div className="min-w-0">
                        <div className="text-sm text-slate-800 font-medium truncate">{i.title}</div>
                        <div className="text-xs text-slate-400" style={mono}>{i.id} · {i.assignee} · {i.status}</div>
                      </div>
                    </div>
                    {ds && <span className={`text-xs shrink-0 ${ds.tone}`}>{ds.label}</span>}
                  </button>
                );
              })}
              {issues.filter((i) => i.dueDate && i.assignee !== "Unassigned").length === 0 && (
                <div className="text-xs text-slate-400 text-center py-6">No timelines set yet.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ---- Developer / Tester / Project Manager: my assignments + report ---- */}
      {["Developer", "Tester", "Project Manager"].includes(role) && (
        <div className="print:hidden space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <h2 className="font-medium text-slate-800 mb-1" style={heading}>My assignments</h2>
            <p className="text-xs text-slate-400 mb-4">Issues assigned to you, with any resolution deadline set by an Admin. Once you resolve one, send the Admin a report of what you did.</p>
            <div className="divide-y divide-slate-100">
              {issues.filter((i) => i.assignee === user.displayName).map((i) => {
                const isDone = ["Resolved", "Closed"].includes(i.status);
                const ds = dueStatus(i.dueDate, isDone);
                return (
                  <div key={i.id} className="py-3">
                    <div className="flex items-center justify-between gap-3">
                      <button onClick={() => onOpen(i.id)} className="text-left flex-1 min-w-0 hover:bg-slate-50 px-2 -mx-2 rounded-lg py-1">
                        <div className="text-sm text-slate-800 font-medium truncate">{i.title}</div>
                        <div className="text-xs text-slate-400 mt-0.5" style={mono}>{i.id} · {i.status}</div>
                      </button>
                      {ds && <span className={`text-xs shrink-0 ${ds.tone}`}>{ds.label}</span>}
                      {isDone && (
                        <button
                          onClick={() => setReportIssue(i)}
                          className="flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-700 shrink-0"
                        >
                          <FileText className="w-3.5 h-3.5" /> Print
                        </button>
                      )}
                    </div>
                    {isDone && (
                      i.resolutionReport ? (
                        <div className="mt-2 text-xs text-slate-400 italic px-2 flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                          {i.reportStatus === "sent"
                            ? "Report sent — Admin has reviewed it and updated the reporter."
                            : "Report sent to Admin — awaiting review."}
                        </div>
                      ) : (
                        <div className="px-2">
                          <SubmitReportForm issue={i} onSubmit={onSubmitReport} />
                        </div>
                      )
                    )}
                  </div>
                );
              })}
              {issues.filter((i) => i.assignee === user.displayName).length === 0 && (
                <div className="text-xs text-slate-400 text-center py-6">Nothing assigned to you right now.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Printable resolution report — hidden on screen, shown only via window.print() */}
      {reportIssue && (
        <div className="hidden" id="resolution-report-print">
          <h1 className="text-xl font-semibold mb-1">Resolution Report</h1>
          <p className="text-sm text-slate-500 mb-6">{reportIssue.id} · generated {fmtDateTime(new Date().toISOString())}</p>
          <table className="w-full text-sm mb-6">
            <tbody>
              <tr><td className="py-1 pr-4 text-slate-500">Title</td><td className="py-1 font-medium">{reportIssue.title}</td></tr>
              <tr><td className="py-1 pr-4 text-slate-500">Project</td><td className="py-1">{reportIssue.project}</td></tr>
              <tr><td className="py-1 pr-4 text-slate-500">Reporter</td><td className="py-1">{reportIssue.reporter}</td></tr>
              <tr><td className="py-1 pr-4 text-slate-500">Resolved by</td><td className="py-1">{reportIssue.assignee}</td></tr>
              <tr><td className="py-1 pr-4 text-slate-500">Severity / Priority</td><td className="py-1">{reportIssue.severity} / {reportIssue.priority}</td></tr>
              <tr><td className="py-1 pr-4 text-slate-500">Reported</td><td className="py-1">{fmtDate(reportIssue.createdAt)}</td></tr>
              <tr><td className="py-1 pr-4 text-slate-500">Due date</td><td className="py-1">{reportIssue.dueDate ? fmtDate(reportIssue.dueDate) : "—"}</td></tr>
              <tr><td className="py-1 pr-4 text-slate-500">Resolved</td><td className="py-1">{fmtDate(reportIssue.resolvedAt)}</td></tr>
              <tr><td className="py-1 pr-4 text-slate-500">Status</td><td className="py-1">{reportIssue.status}</td></tr>
            </tbody>
          </table>
          <div className="mb-6">
            <div className="text-slate-500 text-xs uppercase tracking-wide mb-1">Description</div>
            <p>{reportIssue.description}</p>
          </div>
          {reportIssue.resolutionReport && (
            <div className="mb-6">
              <div className="text-slate-500 text-xs uppercase tracking-wide mb-1">Resolution report (sent to Admin)</div>
              <p className="whitespace-pre-wrap">{reportIssue.resolutionReport}</p>
            </div>
          )}
          {reportIssue.adminResponse && (
            <div className="mb-6">
              <div className="text-slate-500 text-xs uppercase tracking-wide mb-1">Admin's update (sent to reporter)</div>
              <p className="whitespace-pre-wrap">{reportIssue.adminResponse}</p>
            </div>
          )}
          <div>
            <div className="text-slate-500 text-xs uppercase tracking-wide mb-1">Comments & activity</div>
            {[...reportIssue.activity, ...reportIssue.comments].sort((a, b) => new Date(a.at) - new Date(b.at)).map((t) => (
              <div key={t.id} className="text-xs mb-1">
                <span className="text-slate-400">{fmtDateTime(t.at)}</span> — {t.author ? `${t.author}: ${t.text}` : t.text}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/*  New issue form modal                                                   */
/* ---------------------------------------------------------------------- */

function IssueFormModal({ issues, onClose, onSubmit, role, user }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState("Medium");
  const [priority, setPriority] = useState("P2 - Medium");
  const [project, setProject] = useState(PROJECTS[0]);
  const [module, setModule] = useState(MODULES[0]);
  const [environment, setEnvironment] = useState(ENVIRONMENTS[0]);
  const [category, setCategory] = useState(CATEGORIES[3]); // "Backend Logic" default
  const [reporter, setReporter] = useState(user?.displayName || "");
  const [tagsInput, setTagsInput] = useState("");
  const [suggestionApplied, setSuggestionApplied] = useState(false);
  const [showExistingIssues, setShowExistingIssues] = useState(false);
  const [selectedExistingIssue, setSelectedExistingIssue] = useState(null);

  const suggestion = useMemo(() => suggestClassification(`${title} ${description}`), [title, description]);
  const duplicates = useMemo(() => findDuplicates(title, issues), [title, issues]);
  const existingIssueMatches = useMemo(() => {
    const q = title.trim().toLowerCase();
    if (!q) return issues.slice(0, 8);
    return issues
      .filter((i) => `${i.id} ${i.title}`.toLowerCase().includes(q))
      .slice(0, 8);
  }, [title, issues]);

  function selectExistingIssue(issue) {
    setTitle(issue.title);
    setDescription(issue.description || "");
    setSeverity(issue.severity || "Medium");
    setPriority(issue.priority || "P2 - Medium");
    setProject(issue.project || PROJECTS[0]);
    setModule(issue.module || MODULES[0]);
    setEnvironment(issue.environment || ENVIRONMENTS[0]);
    setCategory(issue.category || CATEGORIES[3]);
    setTagsInput((issue.tags || []).join(", "));
    setSelectedExistingIssue(issue);
    setShowExistingIssues(false);
  }

  function applySuggestion() {
    if (!suggestion) return;
    setSeverity(suggestion.severity);
    setPriority(suggestion.priority);
    setSuggestionApplied(true);
  }

  function handleSubmit() {
    if (!title.trim() || !description.trim() || !reporter.trim()) return;
    const tags = tagsInput.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean);
    onSubmit({ title: title.trim(), description: description.trim(), severity, priority, project, module, environment, category, reporter: reporter.trim(), tags });
  }

  return (
    <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white z-10">
          <h2 className="text-lg font-semibold text-slate-900" style={heading}>Report a new issue</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 block">Title</label>
            <div className="relative">
              <input
                value={title}
                onChange={(e) => { setTitle(e.target.value); setSelectedExistingIssue(null); setShowExistingIssues(true); }}
                onFocus={() => setShowExistingIssues(true)}
                placeholder="e.g. Export button throws an error on Firefox"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-violet-400"
              />
              {showExistingIssues && existingIssueMatches.length > 0 && (
                <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-20 overflow-hidden">
                  <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400 border-b border-slate-100">
                    Existing issues — choose one to reuse
                  </div>
                  {existingIssueMatches.map((issue) => (
                    <button
                      key={issue.id}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => selectExistingIssue(issue)}
                      className="w-full text-left px-3 py-2.5 hover:bg-violet-50 transition-colors border-b last:border-b-0 border-slate-100"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-xs font-mono text-slate-400 shrink-0">{issue.id}</span>
                        <span className="text-sm text-slate-700 truncate">{issue.title}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {selectedExistingIssue && (
              <div className="mt-2 text-xs text-violet-700 bg-violet-50 border border-violet-200 rounded-lg px-3 py-2">
                Selected existing issue <span style={mono}>{selectedExistingIssue.id}</span>. Review the details below, then create a new issue only if this is a genuinely separate report.
              </div>
            )}
            {duplicates.length > 0 && (
              <div className="mt-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800 flex gap-2">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <div>
                  This looks similar to existing issue{duplicates.length > 1 ? "s" : ""}:
                  <ul className="mt-1 space-y-0.5">
                    {duplicates.map((d) => <li key={d.issue.id} style={mono}>{d.issue.id} — {d.issue.title}</li>)}
                  </ul>
                  You can still create this as a new issue if it's genuinely different.
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 block">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              placeholder="What happened, what did you expect, and steps to reproduce…"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-violet-400"
            />
            {suggestion && !suggestionApplied && (
              <button
                onClick={applySuggestion}
                className="mt-2 flex items-center gap-1.5 text-xs bg-violet-50 text-violet-700 border border-violet-200 rounded-full px-3 py-1.5 hover:bg-violet-100 transition-colors"
              >
                <Sparkles className="w-3.5 h-3.5" /> Suggested: {suggestion.severity} severity, {suggestion.priority} — apply?
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">Severity</label>
              <Select value={severity} onChange={setSeverity} options={SEVERITIES} />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">Priority</label>
              <Select value={priority} onChange={setPriority} options={PRIORITIES} />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">Project</label>
              <Select value={project} onChange={setProject} options={PROJECTS} />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">Affected module</label>
              <Select value={module} onChange={setModule} options={MODULES} />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">Environment</label>
              <Select value={environment} onChange={setEnvironment} options={ENVIRONMENTS} />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">Category</label>
              <Select value={category} onChange={setCategory} options={CATEGORIES} />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 block">Reporter name</label>
            <input
              value={reporter}
              onChange={(e) => setReporter(e.target.value)}
              placeholder="Your name"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-violet-400"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 block">Tags <span className="text-slate-400 font-normal">(comma separated)</span></label>
            <input
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="e.g. mobile, regression"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-violet-400"
            />
          </div>

          <div className="flex items-start gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 text-xs text-slate-500">
            <ListChecks className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            This issue will be created as <span className="font-medium text-slate-700">Unassigned</span>. An Admin will review and assign it to someone.
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-2 sticky bottom-0 bg-white">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium text-slate-500 hover:bg-slate-50">Cancel</button>
          <button
            onClick={handleSubmit}
            disabled={!title.trim() || !description.trim() || !reporter.trim()}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-violet-600 hover:bg-violet-700 text-white disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Create issue
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/*  Issue detail modal                                                     */
/* ---------------------------------------------------------------------- */

function TriagePanel({ issue, onTriage }) {
  const [severity, setSeverity] = useState(issue.severity);
  const [priority, setPriority] = useState(issue.priority);
  const [category, setCategory] = useState(issue.category || CATEGORIES[3]);
  const [submitting, setSubmitting] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [calcError, setCalcError] = useState(null);
  const [result, setResult] = useState(null); // { priorityScore, priority, recommendations }

  async function handleCalculate() {
    setCalculating(true);
    setCalcError(null);
    try {
      const data = await api.triageRecommendation({
        title: issue.title,
        description: issue.description,
        severity,
        category,
      });
      setResult(data);
      setPriority(data.priority); // auto-fill, admin can still override below
    } catch (err) {
      setCalcError(err.message || "Couldn't calculate a recommendation");
    } finally {
      setCalculating(false);
    }
  }

  async function handleTriage() {
    setSubmitting(true);
    await onTriage(issue.id, { severity, priority, category });
    setSubmitting(false);
  }

  return (
    <div className="bg-violet-50 border border-violet-200 rounded-xl p-4">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-violet-700 uppercase tracking-wide mb-3" style={mono}>
        <ShieldCheck className="w-3.5 h-3.5" /> Triage this issue
      </div>
      <p className="text-xs text-slate-500 mb-3">
        Review severity/category, calculate a priority score and recommended developers, then mark this Triaged before it can be assigned.
      </p>
      <div className="grid grid-cols-3 gap-3 mb-3">
        <div>
          <label className="text-xs font-medium text-slate-500 mb-1 block">Severity</label>
          <Select value={severity} onChange={setSeverity} options={SEVERITIES} />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-500 mb-1 block">Category</label>
          <Select value={category} onChange={setCategory} options={CATEGORIES} />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-500 mb-1 block">Priority</label>
          <Select value={priority} onChange={setPriority} options={PRIORITIES} />
        </div>
      </div>

      <button
        onClick={handleCalculate}
        disabled={calculating}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white border border-violet-300 text-violet-700 hover:bg-violet-100 disabled:opacity-50 mb-3"
      >
        <Sparkles className="w-3.5 h-3.5" />
        {calculating ? "Calculating…" : "Calculate Priority Score"}
      </button>

      {calcError && <div className="text-xs text-rose-600 mb-3">{calcError}</div>}

      {result && (
        <div className="bg-white border border-violet-200 rounded-lg p-3 mb-3 space-y-3">
          <div className="text-xs text-slate-600">
            Priority score <span className="font-semibold text-violet-700" style={mono}>{result.priorityScore}</span> → suggested{" "}
            <span className="font-semibold text-violet-700">{result.priorityLabel}</span> ({result.priority})
          </div>
          {result.recommendations?.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500 mb-1.5">
                <Users className="w-3.5 h-3.5" /> Recommended developers
              </div>
              <div className="space-y-1.5">
                {result.recommendations.map((r) => (
                  <div key={r.id} className="flex items-center justify-between text-xs bg-slate-50 rounded-lg px-2.5 py-1.5">
                    <div className="flex items-center gap-2">
                      <Avatar name={r.displayName} />
                      <div>
                        <div className="font-medium text-slate-700">{r.displayName}</div>
                        <div className="text-slate-400">{r.reason}</div>
                      </div>
                    </div>
                    <div className="font-semibold text-violet-600" style={mono}>{r.matchPercent}% match</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <button
        onClick={handleTriage}
        disabled={submitting}
        className="px-3 py-1.5 rounded-lg text-xs font-medium bg-violet-600 hover:bg-violet-700 text-white disabled:opacity-50"
      >
        {submitting ? "Marking as Triaged…" : "Mark as Triaged"}
      </button>
    </div>
  );
}

function IssueDetailModal({ issue, perms, role, user, users, onClose, onStatusChange, onTriage, onAssign, onComment, onAddTag, onRemoveTag, onUploadAttachment, onDelete, onSubmitReport, onSendUpdate }) {
  const [commentText, setCommentText] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [reportDraft, setReportDraft] = useState("");
  const [submittingReport, setSubmittingReport] = useState(false);
  const [updateDraft, setUpdateDraft] = useState("");
  const [sendingUpdate, setSendingUpdate] = useState(false);
  const fileInputRef = React.useRef(null);

  const isDone = ["Resolved", "Closed"].includes(issue.status);
  const isAssignee = user?.displayName === issue.assignee;
  const isReporter = user?.displayName === issue.reporter;

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      await onUploadAttachment(issue.id, file);
    } catch (err) {
      setUploadError(err.message || "Upload failed");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  const timeline = [
    ...issue.activity.map((a) => ({ ...a, kind: "activity" })),
    ...issue.comments.map((c) => ({ id: c.id, at: c.at, kind: "comment", author: c.author, text: c.text })),
  ].sort((a, b) => new Date(a.at) - new Date(b.at));

  return (
    <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-100 sticky top-0 bg-white z-10">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs text-slate-400" style={mono}>{issue.id}</span>
                <span className="text-xs text-slate-300">·</span>
                <span className="text-xs text-slate-400">{issue.project}</span>
              </div>
              <h2 className="text-lg font-semibold text-slate-900" style={heading}>{issue.title}</h2>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
          </div>
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <SeverityBadge severity={issue.severity} />
            <PriorityChip priority={issue.priority} />
            <span className="text-xs text-slate-400 px-2 py-0.5 bg-slate-50 rounded-md border border-slate-100">{issue.module}</span>
            <span className="text-xs text-slate-400 px-2 py-0.5 bg-slate-50 rounded-md border border-slate-100">{issue.environment}</span>
          </div>
        </div>

        <div className="p-6 space-y-6">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wide" style={mono}>Pipeline</span>
              {perms.editStatus ? (
                <Select
                  value={issue.status}
                  onChange={(v) => onStatusChange(issue.id, v)}
                  options={STATUSES}
                  className="w-40"
                />
              ) : (
                <span className="text-xs text-slate-500">{issue.status} (read only for {role})</span>
              )}
            </div>
            <PipelineTrace status={issue.status} size="lg" showLabels />
          </div>

          {perms.assign && issue.status === "Open" && (
            <TriagePanel issue={issue} onTriage={onTriage} />
          )}

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-xs text-slate-400 mb-1">Reporter</div>
              <div className="text-slate-700">{issue.reporter}</div>
            </div>
            <div>
              <div className="text-xs text-slate-400 mb-1">Assignee</div>
              {perms.assign ? (
                issue.status === "Open" ? (
                  <div className="text-xs text-slate-400 italic">Triage this issue first to unlock assignment</div>
                ) : (
                  <Select
                    value={issue.assignee}
                    onChange={(v) => onAssign(issue.id, v, issue.dueDate ? issue.dueDate.slice(0, 10) : undefined)}
                    options={["Unassigned", ...users.map((u) => u.displayName)]}
                    className="w-44"
                  />
                )
              ) : (
                <div className="flex items-center gap-1.5"><Avatar name={issue.assignee} />{issue.assignee}</div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm -mt-2">
            <div />
            <div>
              <div className="text-xs text-slate-400 mb-1 flex items-center gap-1"><CalendarClock className="w-3 h-3" /> Resolution deadline</div>
              {perms.assign && issue.assignee !== "Unassigned" ? (
                <input
                  type="date"
                  value={issue.dueDate ? issue.dueDate.slice(0, 10) : ""}
                  onChange={(e) => onAssign(issue.id, issue.assignee, e.target.value || null)}
                  className="w-44 border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
                />
              ) : (
                <div className={dueStatus(issue.dueDate, ["Resolved", "Closed"].includes(issue.status))?.tone || "text-slate-500"}>
                  {issue.dueDate ? dueStatus(issue.dueDate, ["Resolved", "Closed"].includes(issue.status)).label : "No deadline set"}
                </div>
              )}
            </div>
          </div>

          <div>
            <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1.5" style={mono}>Description</div>
            <p className="text-sm text-slate-700 leading-relaxed">{issue.description}</p>
          </div>

          {/* ---- Resolution report workflow: assignee -> Admin -> reporter ---- */}
          {isDone && (
            <div>
              <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1.5" style={mono}>Resolution report</div>

              {issue.resolutionReport && (role === "Admin" || isAssignee) && (
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 mb-2">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1">
                    {issue.assignee}'s report to Admin
                  </div>
                  <p className="text-sm text-slate-700 whitespace-pre-wrap">{issue.resolutionReport}</p>
                </div>
              )}

              {!issue.resolutionReport && isAssignee && (
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2">
                  <p className="text-xs text-slate-500">Write up what you did to fix this — it goes straight to the Admin for review.</p>
                  <textarea
                    value={reportDraft}
                    onChange={(e) => setReportDraft(e.target.value)}
                    rows={3}
                    placeholder="What was the root cause, what did you change, how did you verify the fix…"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-violet-400"
                  />
                  <div className="flex justify-end">
                    <button
                      disabled={!reportDraft.trim() || submittingReport}
                      onClick={async () => {
                        setSubmittingReport(true);
                        await onSubmitReport(issue.id, reportDraft);
                        setSubmittingReport(false);
                        setReportDraft("");
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white"
                    >
                      <Send className="w-3.5 h-3.5" /> {submittingReport ? "Sending…" : "Send to Admin"}
                    </button>
                  </div>
                </div>
              )}

              {!issue.resolutionReport && !isAssignee && (
                <div className="text-xs text-slate-400 italic">Waiting on {issue.assignee} to submit a resolution report.</div>
              )}

              {issue.resolutionReport && role === "Admin" && !issue.adminResponse && (
                <div className="bg-white border border-slate-200 rounded-lg p-3 space-y-2 mt-2">
                  <label className="text-xs font-medium text-slate-500 block">Send an update to {issue.reporter}</label>
                  <textarea
                    value={updateDraft}
                    onChange={(e) => setUpdateDraft(e.target.value)}
                    rows={2}
                    placeholder={`Hi ${issue.reporter.split(" ")[0]}, your issue has been resolved…`}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-violet-400"
                  />
                  <div className="flex justify-end">
                    <button
                      disabled={!updateDraft.trim() || sendingUpdate}
                      onClick={async () => {
                        setSendingUpdate(true);
                        await onSendUpdate(issue.id, updateDraft);
                        setSendingUpdate(false);
                        setUpdateDraft("");
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white"
                    >
                      <Send className="w-3.5 h-3.5" /> {sendingUpdate ? "Sending…" : "Send update to reporter"}
                    </button>
                  </div>
                </div>
              )}

              {issue.resolutionReport && role !== "Admin" && !isAssignee && !issue.adminResponse && (
                <div className="text-xs text-slate-400 italic">Report sent to the Admin — waiting on their review.</div>
              )}

              {issue.adminResponse && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 mt-2">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700 mb-1 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Admin's update {isReporter ? "to you" : `to ${issue.reporter}`}
                  </div>
                  <p className="text-sm text-emerald-900 whitespace-pre-wrap">{issue.adminResponse}</p>
                </div>
              )}
            </div>
          )}

          <div>
            <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1.5" style={mono}>Tags</div>
            <div className="flex flex-wrap gap-1.5 items-center">
              {issue.tags.map((t) => (
                <span key={t} className="flex items-center gap-1 text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded-md">
                  <TagIcon className="w-3 h-3" /> {t}
                  <button onClick={() => onRemoveTag(issue.id, t)} className="text-slate-400 hover:text-slate-600 ml-0.5"><X className="w-3 h-3" /></button>
                </span>
              ))}
              <input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && tagInput.trim()) { onAddTag(issue.id, tagInput); setTagInput(""); } }}
                placeholder="+ add tag"
                className="text-xs border border-dashed border-slate-300 rounded-md px-2 py-1 w-24 focus:outline-none focus:ring-1 focus:ring-violet-400"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-medium text-slate-500 uppercase tracking-wide" style={mono}>Attachments</div>
              <label className="flex items-center gap-1 text-xs font-medium text-violet-600 hover:text-violet-700 cursor-pointer">
                <Paperclip className="w-3.5 h-3.5" /> {uploading ? "Uploading…" : "Attach file"}
                <input ref={fileInputRef} type="file" accept=".png,.jpg,.jpeg,.log" className="hidden" onChange={handleFileChange} disabled={uploading} />
              </label>
            </div>
            {uploadError && <div className="text-xs text-rose-600 mb-2">{uploadError}</div>}
            {issue.attachments?.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {issue.attachments.map((f) => (
                  <a
                    key={f.id}
                    href={f.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 text-xs bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-600"
                  >
                    <Paperclip className="w-3 h-3 text-slate-400" />
                    {f.filename}
                    <span className="text-slate-300">·</span>
                    <span className="text-slate-400">{f.uploadedBy}</span>
                  </a>
                ))}
              </div>
            ) : (
              <div className="text-xs text-slate-400">No screenshots or logs attached yet.</div>
            )}
          </div>

          <div>
            <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2" style={mono}>Activity & comments</div>
            <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
              {timeline.map((t) => (
                <div key={t.id} className="flex gap-2.5 text-sm">
                  {t.kind === "comment" ? <MessageSquare className="w-3.5 h-3.5 text-violet-400 mt-0.5 shrink-0" /> : <Clock className="w-3.5 h-3.5 text-slate-300 mt-0.5 shrink-0" />}
                  <div className="flex-1">
                    {t.kind === "comment" ? (
                      <>
                        <span className="font-medium text-slate-700">{t.author}</span>{" "}
                        <span className="text-slate-500">{t.text}</span>
                      </>
                    ) : (
                      <span className="text-slate-500">{t.text}{t.actor ? ` — ${t.actor}` : ""}</span>
                    )}
                    <div className="text-[10px] text-slate-300 mt-0.5" style={mono}>{fmtDateTime(t.at)}</div>
                  </div>
                </div>
              ))}
            </div>
            {perms.comment && (
              <div className="mt-3 flex gap-2">
                <input
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && commentText.trim()) { onComment(issue.id, commentText); setCommentText(""); } }}
                  placeholder="Add a comment…"
                  className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-violet-400"
                />
                <button
                  onClick={() => { if (commentText.trim()) { onComment(issue.id, commentText); setCommentText(""); } }}
                  className="px-3.5 py-2 rounded-lg text-sm font-medium bg-slate-800 hover:bg-slate-900 text-white"
                >
                  Post
                </button>
              </div>
            )}
          </div>
        </div>

        {perms.del && (
          <div className="px-6 py-4 border-t border-slate-100 flex justify-end sticky bottom-0 bg-white">
            {confirmDelete ? (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-slate-500">Delete {issue.id} permanently?</span>
                <button onClick={() => onDelete(issue.id)} className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-medium">Yes, delete</button>
                <button onClick={() => setConfirmDelete(false)} className="px-3 py-1.5 rounded-lg text-slate-500 hover:bg-slate-50">Cancel</button>
              </div>
            ) : (
              <button onClick={() => setConfirmDelete(true)} className="flex items-center gap-1.5 text-sm text-rose-500 hover:text-rose-600 font-medium">
                <Trash2 className="w-3.5 h-3.5" /> Delete issue
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
