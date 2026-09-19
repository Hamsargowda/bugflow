import React, { useState, useEffect, useCallback } from "react";
import createPlotlyComponent from "react-plotly.js/factory";
import Plotly from "plotly.js-dist-min";
import {
  GitCommitHorizontal, Download, FileDown, Send, Loader2,
  CheckCircle2, XCircle, ShieldCheck, Radio,
} from "lucide-react";
import { api } from "./api.js";

const Plot = createPlotlyComponent(Plotly);
const heading = { fontFamily: "'Space Grotesk', sans-serif" };
const mono = { fontFamily: "'JetBrains Mono', monospace" };

const EXPLORER_ENDPOINTS = [
  { label: "GET /api/issues", path: "/api/issues" },
  { label: "GET /api/v1/analytics/quality-metrics", path: "/api/v1/analytics/quality-metrics" },
  { label: "GET /api/v1/analytics/defect-trends", path: "/api/v1/analytics/defect-trends" },
  { label: "GET /api/v1/analytics/plotly-charts", path: "/api/v1/analytics/plotly-charts" },
  { label: "GET /api/sprints", path: "/api/sprints" },
  { label: "GET /api/notifications", path: "/api/notifications" },
  { label: "GET /api/health", path: "/api/health" },
];

function Card({ children, className = "" }) {
  return <div className={`bg-white border border-slate-200 rounded-xl p-5 ${className}`}>{children}</div>;
}

function StatusPill({ ok, label }) {
  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium ${ok ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" : "bg-rose-50 text-rose-700 ring-1 ring-rose-200"}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${ok ? "bg-emerald-500" : "bg-rose-500"} ${ok ? "animate-pulse" : ""}`} />
      {label}
    </div>
  );
}

export default function DevOpsDashboardView({ issues }) {
  const [metrics, setMetrics] = useState(null);
  const [charts, setCharts] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [exporting, setExporting] = useState(null);

  const [explorerPath, setExplorerPath] = useState(EXPLORER_ENDPOINTS[0].path);
  const [explorerResult, setExplorerResult] = useState(null);
  const [explorerLoading, setExplorerLoading] = useState(false);

const sampleIssueId = issues?.[0]?.id || "BUG-1001";
const [selectedIssueId, setSelectedIssueId] = useState(sampleIssueId);
const [commitMessage, setCommitMessage] = useState(
  `Merge PR #45: fixes #${sampleIssueId.replace("BUG-", "")} login password crash`
);
const [webhookResult, setWebhookResult] = useState(null);
const [webhookLoading, setWebhookLoading] = useState(false);

function handleSelectIssue(issueId) {
  setSelectedIssueId(issueId);
  setCommitMessage(`Merge PR #45: fixes #${issueId.replace("BUG-", "")} login password crash`);
}
  

  const loadAnalytics = useCallback(async () => {
    setLoadError(null);
    try {
      const [m, c] = await Promise.all([api.getQualityMetrics(), api.getPlotlyCharts()]);
      setMetrics(m);
      setCharts(c);
    } catch (err) {
      setLoadError(err.message);
    }
  }, []);

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  async function runExplorer() {
    setExplorerLoading(true);
    setExplorerResult(null);
    try {
      const data = await api.explorerGet(explorerPath);
      setExplorerResult({ ok: true, data });
    } catch (err) {
      setExplorerResult({ ok: false, error: err.message });
    } finally {
      setExplorerLoading(false);
    }
  }

  async function runWebhookSimulation() {
    setWebhookLoading(true);
    setWebhookResult(null);
    try {
      const data = await api.simulateGitCommit(commitMessage);
      setWebhookResult({ ok: true, data });
      await loadAnalytics();
    } catch (err) {
      setWebhookResult({ ok: false, error: err.message });
    } finally {
      setWebhookLoading(false);
    }
  }

  async function handleExport(kind) {
    setExporting(kind);
    try {
      if (kind === "pdf") {
        await api.downloadWithAuth(api.exportPdfUrl(), "bugflow-quality-report.pdf");
      } else {
        await api.downloadWithAuth(api.exportCsvUrl(), "bugflow-registry.csv");
      }
    } catch (err) {
      setLoadError(err.message);
    } finally {
      setExporting(null);
    }
  }

  const scoreTone = (score) => (score >= 90 ? "text-emerald-600" : score >= 70 ? "text-amber-600" : "text-rose-600");

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900" style={heading}>DevOps Dashboard</h1>
        <p className="text-sm text-slate-500 mt-1">CI/CD automation, quality scorecard, interactive charts, and report exports.</p>
      </div>

      {loadError && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-lg px-4 py-3">{loadError}</div>
      )}

      {/* Service banner */}
      <Card className="flex flex-wrap items-center gap-3">
        <StatusPill ok label="Notification Service: Running" />
        <StatusPill ok label="Security Status: CI/CD Sync Active" />
        <div className="flex-1" />
        <button
          onClick={() => handleExport("pdf")}
          disabled={exporting === "pdf"}
          className="flex items-center gap-1.5 text-sm bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white px-3.5 py-2 rounded-lg font-medium"
        >
          {exporting === "pdf" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />} Export PDF
        </button>
        <button
          onClick={() => handleExport("csv")}
          disabled={exporting === "csv"}
          className="flex items-center gap-1.5 text-sm border border-slate-200 hover:border-slate-300 bg-white disabled:opacity-60 px-3.5 py-2 rounded-lg text-slate-600 font-medium"
        >
          {exporting === "csv" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />} Export CSV
        </button>
      </Card>

      {/* Quality scorecard */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Fix Rate", value: metrics ? `${metrics.fixRatePercentage}%` : "—", tone: "text-emerald-600" },
          { label: "Mean Time to Resolution", value: metrics ? `${metrics.meanTimeToResolutionHours}h` : "—", tone: "text-violet-600" },
          { label: "Defect Leakage Rate", value: metrics ? `${metrics.defectLeakageRatePercentage}%` : "—", tone: "text-orange-600" },
          { label: "Backlog Health Score", value: metrics ? `${metrics.backlogHealthScore}/100` : "—", tone: metrics ? scoreTone(metrics.backlogHealthScore) : "text-slate-800" },
        ].map((c) => (
          <Card key={c.label} className="!p-4">
            <div className="text-xs text-slate-500 mb-1.5">{c.label}</div>
            <div className={`text-3xl font-semibold ${c.tone}`} style={heading}>{c.value}</div>
          </Card>
        ))}
      </div>

      {/* Plotly charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <div className="text-sm font-medium text-slate-700 mb-2">Defect Trend (zoomable — last 14 days)</div>
          {charts ? (
            <Plot
              data={charts.defectTrend.data}
              layout={{ ...charts.defectTrend.layout, autosize: true, title: undefined }}
              style={{ width: "100%", height: "280px" }}
              useResizeHandler
              config={{ responsive: true, displaylogo: false }}
            />
          ) : (
            <div className="h-[280px] flex items-center justify-center text-slate-400 text-sm">
              <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading chart…
            </div>
          )}
        </Card>
        <Card>
          <div className="text-sm font-medium text-slate-700 mb-2">Severity Breakdown</div>
          {charts ? (
            <Plot
              data={charts.severityDonut.data}
              layout={{ ...charts.severityDonut.layout, autosize: true, title: undefined }}
              style={{ width: "100%", height: "280px" }}
              useResizeHandler
              config={{ responsive: true, displaylogo: false }}
            />
          ) : (
            <div className="h-[280px] flex items-center justify-center text-slate-400 text-sm">
              <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading chart…
            </div>
          )}
        </Card>
        <Card className="lg:col-span-2">
          <div className="text-sm font-medium text-slate-700 mb-2">Workflow Pipeline</div>
          {charts ? (
            <Plot
              data={charts.workflowBar.data}
              layout={{ ...charts.workflowBar.layout, autosize: true, title: undefined }}
              style={{ width: "100%", height: "260px" }}
              useResizeHandler
              config={{ responsive: true, displaylogo: false }}
            />
          ) : (
            <div className="h-[260px] flex items-center justify-center text-slate-400 text-sm">
              <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading chart…
            </div>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Webhook simulator */}
        <Card>
          <div className="flex items-center gap-2 mb-1">
            <GitCommitHorizontal className="w-4 h-4 text-violet-600" />
            <div className="text-sm font-medium text-slate-700">CI/CD Git Webhook Simulator</div>
          </div>
          <p className="text-xs text-slate-500 mb-3">
            Simulates <code style={mono}>POST /api/v1/webhooks/git</code>. A commit message containing
            "fixes #n", "closes #n", or "resolves #n" auto-transitions that bug to <b>QA Verification</b>.
          </p>
          <label className="text-xs font-medium text-slate-500 mb-1 block">
  Choose an issue
</label>

<select
  value={selectedIssueId}
  onChange={(e) => handleSelectIssue(e.target.value)}
  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-violet-400"
>
  {(issues || []).map((i) => (
    <option key={i.id} value={i.id}>
      {i.id} — {i.title} ({i.status})
    </option>
  ))}
</select>

<label className="text-xs font-medium text-slate-500 mb-1 block">
  Commit message
</label>

<input
  value={commitMessage}
  onChange={(e) => setCommitMessage(e.target.value)}
  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-violet-400"
  style={mono}
/>

<button
  onClick={runWebhookSimulation}
  disabled={webhookLoading}
  className="flex items-center gap-1.5 text-sm bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white px-3.5 py-2 rounded-lg font-medium"
>
  {webhookLoading ? (
    <Loader2 className="w-3.5 h-3.5 animate-spin" />
  ) : (
    <Send className="w-3.5 h-3.5" />
  )}
  Simulate Git Commit (fixes #{selectedIssueId.replace("BUG-", "")})
</button>
          {webhookResult && (
            <pre
              className={`mt-3 text-xs rounded-lg p-3 overflow-auto max-h-48 ${webhookResult.ok ? "bg-slate-50 text-slate-700" : "bg-rose-50 text-rose-700"}`}
              style={mono}
            >
              {JSON.stringify(webhookResult.ok ? webhookResult.data : { error: webhookResult.error }, null, 2)}
            </pre>
          )}
        </Card>

        {/* Live REST API Explorer */}
        <Card>
          <div className="flex items-center gap-2 mb-1">
            <Radio className="w-4 h-4 text-violet-600" />
            <div className="text-sm font-medium text-slate-700">Live REST API Explorer</div>
          </div>
          <p className="text-xs text-slate-500 mb-3">Pick an endpoint, hit Send, see the real JSON response.</p>
          <div className="flex gap-2 mb-3">
            <select
              value={explorerPath}
              onChange={(e) => setExplorerPath(e.target.value)}
              className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
            >
              {EXPLORER_ENDPOINTS.map((e) => (
                <option key={e.path} value={e.path}>{e.label}</option>
              ))}
            </select>
            <button
              onClick={runExplorer}
              disabled={explorerLoading}
              className="flex items-center gap-1.5 text-sm bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white px-3.5 py-2 rounded-lg font-medium"
            >
              {explorerLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} Send
            </button>
          </div>
          {explorerResult && (
            <div>
              <div className="flex items-center gap-1.5 text-xs mb-1.5">
                {explorerResult.ok ? (
                  <><CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> <span className="text-emerald-700">200 OK</span></>
                ) : (
                  <><XCircle className="w-3.5 h-3.5 text-rose-600" /> <span className="text-rose-700">Request failed</span></>
                )}
              </div>
              <pre
                className={`text-xs rounded-lg p-3 overflow-auto max-h-48 ${explorerResult.ok ? "bg-slate-50 text-slate-700" : "bg-rose-50 text-rose-700"}`}
                style={mono}
              >
                {JSON.stringify(explorerResult.ok ? explorerResult.data : { error: explorerResult.error }, null, 2)}
              </pre>
            </div>
          )}
        </Card>
      </div>

      <div className="flex items-center gap-1.5 text-xs text-slate-400">
        <ShieldCheck className="w-3.5 h-3.5" /> Backlog Health Score ≥ 90 means the project is clean and ready for release.
      </div>
    </div>
  );
}
