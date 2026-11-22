"use client";

import React, { useState } from "react";
import {
  FileText,
  Printer,
  Download,
  X,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Cpu,
  Wifi,
  Smartphone,
  Eye,
  GitCompare,
  TrendingDown,
  TrendingUp,
  Info,
  ChevronRight,
  Layers,
  Sparkles
} from "lucide-react";
import { ApiClient } from "@/lib/api";
import HealthScoreCard, { calculateWebsiteHealthScore } from "./HealthScoreCard";
import VisualEvidenceViewer from "./VisualEvidenceViewer";

interface AuditReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  reportData: any; // Can be a single run or a comparison payload
  historicalRuns?: any[];
}

export default function AuditReportModal({
  isOpen,
  onClose,
  reportData,
  historicalRuns = []
}: AuditReportModalProps) {
  const [showEvidence, setShowEvidence] = useState(false);
  const [selectedRunIdx, setSelectedRunIdx] = useState(0);

  if (!isOpen || !reportData) return null;

  // Determine if reportData is comparison payload or single run
  const isComparison = Boolean(reportData.runs && Array.isArray(reportData.runs) && reportData.runs.length > 0);
  const runs: any[] = isComparison ? reportData.runs : [reportData];
  const activeRun = runs[selectedRunIdx] || runs[0];

  const targetUrl = activeRun.target_url || reportData.target_url || "https://app.local";

  // Normalize metrics from all potential shapes (array, dict, metrics_summary, current_metrics)
  let rawMetrics: any =
    activeRun.metrics ||
    activeRun.metrics_summary ||
    activeRun.current_metrics ||
    reportData.metrics ||
    reportData.metrics_summary ||
    reportData.current_metrics ||
    [];

  if (!Array.isArray(rawMetrics) && typeof rawMetrics === "object" && rawMetrics !== null) {
    rawMetrics = Object.entries(rawMetrics).map(([name, value]) => ({
      name,
      value: value as any,
      unit: name.includes("TIME") || name === "LCP" || name === "FCP" || name === "TTFB" ? "ms" : name === "CLS" ? "score" : ""
    }));
  }
  const metrics: Array<{ name: string; value: any; unit?: string; rating?: string }> = Array.isArray(rawMetrics) ? rawMetrics : [];
  const failures = activeRun.failures || reportData.failures || [];
  const recommendations = activeRun.recommendations || reportData.recommendations || [];
  const deviceProfile = activeRun.device_profile || {};
  const baseUrl = ApiClient.getBaseUrl();

  const screenshotUrl = activeRun.screenshot_url
    ? (activeRun.screenshot_url.startsWith("http") ? activeRun.screenshot_url : `${baseUrl}${activeRun.screenshot_url.startsWith("/") ? "" : "/"}${activeRun.screenshot_url}`)
    : null;

  // Calculate Health Score
  const health = calculateWebsiteHealthScore(metrics, failures);

  // Before / After comparison calculation if previous historical runs exist
  const previousRun = historicalRuns.find(
    (h: any) => h.id !== activeRun.id && (h.target_url === targetUrl || h.project_name === activeRun.project_name)
  );

  const calculateDelta = (metricName: string) => {
    if (!previousRun || !previousRun.metrics) return null;
    const curr = metrics.find((m: any) => m.name === metricName)?.value;
    const prev = previousRun.metrics.find((m: any) => m.name === metricName)?.value;
    if (curr === undefined || prev === undefined || Number(prev) === 0) return null;
    const diff = Number(curr) - Number(prev);
    const pct = Math.round((diff / Number(prev)) * 100);
    return { diff: Math.round(diff * 100) / 100, pct };
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#252525]/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      {/* Report Container */}
      <div className="w-full max-w-5xl bg-white rounded-xl shadow-2xl border border-[#E6E2D9] my-auto overflow-hidden flex flex-col max-h-[92vh]">
        {/* Sticky Action Toolbar (Hidden during print) */}
        <div className="flex items-center justify-between px-6 py-4 bg-[#F0EEE8] border-b border-[#E6E2D9] print:hidden">
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-lg bg-[#F8E9DF] text-[#D97745] flex items-center justify-center font-bold">
              <FileText className="w-4 h-4" />
            </span>
            <div>
              <h2 className="text-sm font-semibold text-[#252525]">TierLens Performance Audit Report</h2>
              <p className="text-xs text-[#6B6B65]">Deterministic, evidence-grounded engineering audit</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {runs.length > 1 && (
              <select
                value={selectedRunIdx}
                onChange={(e) => setSelectedRunIdx(Number(e.target.value))}
                className="text-xs py-1.5 px-2.5 bg-white border border-[#E6E2D9] rounded-lg text-[#252525] focus:outline-hidden"
              >
                {runs.map((r, i) => (
                  <option key={r.id || i} value={i}>
                    {r.device_profile?.name || `Configuration #${i + 1}`}
                  </option>
                ))}
              </select>
            )}

            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#D97745] hover:bg-[#B95E32] text-white text-xs font-semibold rounded-lg transition-colors shadow-xs"
              title="Print or Save as PDF"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Export PDF / Print</span>
            </button>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg border border-[#E6E2D9] bg-white text-[#6B6B65] hover:text-[#252525] hover:bg-[#EEECE5] transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Report Printable Content */}
        <div className="overflow-y-auto p-6 sm:p-8 space-y-6 text-[#252525] print:p-0 print:overflow-visible">
          {/* Header Summary */}
          <div className="border-b border-[#E6E2D9] pb-6 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-[#D97745] bg-[#F8E9DF] px-2 py-0.5 rounded">
                  Audit Summary
                </span>
                <span className="text-xs text-[#96948D]">•</span>
                <span className="text-xs text-[#6B6B65]">
                  {activeRun.completed_at ? new Date(activeRun.completed_at).toLocaleString() : "Recent Run"}
                </span>
              </div>
              <h1 className="text-2xl font-bold text-[#252525] mt-2 flex items-center gap-2 truncate">
                <span>{targetUrl}</span>
                <a
                  href={targetUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#96948D] hover:text-[#D97745]"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
              </h1>
              <p className="text-xs text-[#6B6B65] mt-1">
                Audited with headless Chromium under controlled DevTools hardware & network emulation.
              </p>
            </div>

            <div className="text-right sm:border-l sm:border-[#E6E2D9] sm:pl-6 shrink-0 space-y-1">
              <div className="text-xs text-[#6B6B65]">
                Overall Health Score: <span className="font-bold text-base text-[#252525]">{health.compositeScore}/100</span>
              </div>
              <div
                className="text-xs font-semibold px-2 py-0.5 rounded-full inline-block"
                style={{ backgroundColor: health.gradeBg, color: health.gradeColor }}
              >
                Grade: {health.grade}
              </div>
              <div className="text-[11px] text-[#96948D]">
                Run ID: {activeRun.id ? activeRun.id.substring(0, 12) : "N/A"}
              </div>
            </div>
          </div>

          {/* Test Conditions & Profile Specifications */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-[#FAF9F5] p-4 rounded-xl border border-[#E6E2D9]">
            <div>
              <span className="text-[10px] uppercase font-semibold text-[#6B6B65] block">Device Profile</span>
              <span className="text-xs font-semibold text-[#252525] block truncate mt-0.5">
                {deviceProfile.name || "Default Preset"}
              </span>
              <span className="text-[10px] text-[#96948D]">{deviceProfile.tier || "Custom"}</span>
            </div>

            <div>
              <span className="text-[10px] uppercase font-semibold text-[#6B6B65] block">CPU Throttling</span>
              <span className="text-xs font-semibold text-[#252525] block mt-0.5">
                {deviceProfile.cpu_throttle_rate || 1}x Slowdown
              </span>
              <span className="text-[10px] text-[#96948D]">{deviceProfile.cpu_cores || 4} Cores emulated</span>
            </div>

            <div>
              <span className="text-[10px] uppercase font-semibold text-[#6B6B65] block">Network Profile</span>
              <span className="text-xs font-semibold text-[#252525] block truncate mt-0.5">
                {deviceProfile.network_profile || "Broadband"}
              </span>
              <span className="text-[10px] text-[#96948D]">{deviceProfile.network_latency_ms || 0}ms latency</span>
            </div>

            <div>
              <span className="text-[10px] uppercase font-semibold text-[#6B6B65] block">RAM Allocation</span>
              <span className="text-xs font-semibold text-[#252525] block mt-0.5">
                {Math.round((deviceProfile.ram_mb || 4096) / 1024)}GB Profile RAM
              </span>
              <span className="text-[10px] text-[#96948D]">{deviceProfile.viewport_width || 390}x{deviceProfile.viewport_height || 844}</span>
            </div>
          </div>

          {/* Health Score Breakdown Card */}
          <HealthScoreCard
            metrics={metrics}
            failures={failures}
            deviceName={deviceProfile.name}
            targetUrl={targetUrl}
          />

          {/* Core Web Vitals Table */}
          <div className="bg-white border border-[#E6E2D9] rounded-xl overflow-hidden shadow-xs">
            <div className="px-5 py-3.5 bg-[#F0EEE8] border-b border-[#E6E2D9] flex items-center justify-between">
              <h3 className="text-xs font-semibold text-[#252525] uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-[#D97745]" />
                <span>Measured Web Vitals & Performance Breakdown</span>
              </h3>
              <span className="text-[11px] text-[#6B6B65]">Actual CDP Observations</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[#E6E2D9] bg-[#FAF9F5] text-[#6B6B65] font-semibold text-[11px]">
                    <th className="py-2.5 px-4">Metric</th>
                    <th className="py-2.5 px-4">Measured Value</th>
                    <th className="py-2.5 px-4">Target Benchmark</th>
                    <th className="py-2.5 px-4">Rating</th>
                    <th className="py-2.5 px-4">Hardware Degradation Context</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E6E2D9]">
                  {[
                    { key: "LCP", name: "Largest Contentful Paint (LCP)", target: "≤ 2.5s", desc: "Main visual content visible to user" },
                    { key: "FCP", name: "First Contentful Paint (FCP)", target: "≤ 1.8s", desc: "First DOM paint render onset" },
                    { key: "CLS", name: "Cumulative Layout Shift (CLS)", target: "≤ 0.10", desc: "Visual stability during page layout" },
                    { key: "TTFB", name: "Time to First Byte (TTFB)", target: "≤ 0.8s", desc: "Backend response & connection establishment" },
                    { key: "DOM_CONTENT_LOADED", name: "DOMContentLoaded", target: "≤ 3.0s", desc: "HTML parsing and synchronous scripts complete" },
                    { key: "PAGE_LOAD_TIME", name: "Full Page Load Time", target: "≤ 5.0s", desc: "Complete window load lifecycle" },
                    { key: "TRANSFER_SIZE_KB", name: "Total Transfer Size", target: "≤ 1500 KB", desc: "Aggregate network payload downloaded" },
                    { key: "TOTAL_RESOURCES", name: "Total Requests", target: "≤ 60 req", desc: "Subresource requests initiated" }
                  ].map((row) => {
                    const m = metrics.find((item: any) => item.name === row.key);
                    const val = m ? `${m.value} ${m.unit || ""}` : "Not recorded";
                    const rating = m?.rating || "INFO";

                    let ratingColor = "bg-[#EEF4FB] text-[#557DAA]";
                    if (rating === "GOOD") ratingColor = "bg-[#EAF4EE] text-[#36865A]";
                    else if (rating === "NEEDS_IMPROVEMENT") ratingColor = "bg-[#FDF6EC] text-[#C58A35]";
                    else if (rating === "POOR") ratingColor = "bg-[#FCEEEF] text-[#C6534B]";

                    return (
                      <tr key={row.key} className="hover:bg-[#FAF9F5]/60 transition-colors">
                        <td className="py-2.5 px-4 font-medium text-[#252525]">{row.name}</td>
                        <td className="py-2.5 px-4 font-mono font-bold text-[#252525]">{val}</td>
                        <td className="py-2.5 px-4 text-[#6B6B65]">{row.target}</td>
                        <td className="py-2.5 px-4">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${ratingColor}`}>
                            {rating.replace("_", " ")}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-[#6B6B65] text-[11px]">{row.desc}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Before / After Comparison (when historical runs exist) */}
          {previousRun && (
            <div className="bg-white border border-[#E6E2D9] rounded-xl p-5 shadow-xs">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-semibold text-[#6B6B65] uppercase tracking-wider flex items-center gap-1.5">
                  <GitCompare className="w-4 h-4 text-[#D97745]" />
                  <span>Historical Trend & Before/After Comparison</span>
                </h3>
                <span className="text-xs text-[#96948D]">
                  Comparing vs Run #{previousRun.id?.substring(0, 8)}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {["LCP", "FCP", "CLS", "TTFB"].map((mName) => {
                  const delta = calculateDelta(mName);
                  if (!delta) return null;
                  const isBetter = delta.diff < 0;

                  return (
                    <div key={mName} className="p-3 bg-[#FAF9F5] rounded-lg border border-[#E6E2D9]">
                      <span className="text-[10px] font-semibold text-[#6B6B65] block">{mName} Shift</span>
                      <div className="flex items-center gap-1.5 mt-1">
                        {isBetter ? (
                          <TrendingDown className="w-4 h-4 text-[#36865A]" />
                        ) : (
                          <TrendingUp className="w-4 h-4 text-[#C6534B]" />
                        )}
                        <span
                          className={`text-xs font-bold ${
                            isBetter ? "text-[#36865A]" : "text-[#C6534B]"
                          }`}
                        >
                          {delta.pct > 0 ? `+${delta.pct}%` : `${delta.pct}%`}
                        </span>
                      </div>
                      <span className="text-[10px] text-[#96948D]">
                        {isBetter ? "Performance improved" : "Degraded vs prior run"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Visual Evidence Section */}
          <div className="bg-white border border-[#E6E2D9] rounded-xl p-5 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-semibold text-[#6B6B65] uppercase tracking-wider flex items-center gap-1.5">
                <Eye className="w-4 h-4 text-[#D97745]" />
                <span>Captured Visual Evidence & Screenshot Artifact</span>
              </h3>
              {screenshotUrl && (
                <button
                  onClick={() => setShowEvidence(true)}
                  className="text-xs text-[#D97745] hover:underline flex items-center gap-1 font-semibold"
                >
                  <span>Open Fullscreen Inspector</span>
                  <ExternalLink className="w-3 h-3" />
                </button>
              )}
            </div>

            {screenshotUrl ? (
              <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-center">
                <div
                  onClick={() => setShowEvidence(true)}
                  className="md:col-span-4 bg-[#FAF9F5] p-2 rounded-lg border border-[#E6E2D9] cursor-pointer hover:shadow-sm transition-all"
                >
                  <img
                    src={screenshotUrl}
                    alt="Audit Screenshot Evidence"
                    className="rounded max-h-56 w-auto mx-auto object-contain block"
                  />
                  <div className="text-center text-[10px] text-[#6B6B65] mt-1.5 font-medium">
                    Click to zoom & inspect element regions
                  </div>
                </div>

                <div className="md:col-span-8 space-y-2.5">
                  <h4 className="text-xs font-semibold text-[#252525]">Visual Failure Analysis</h4>
                  <p className="text-xs text-[#6B6B65] leading-relaxed">
                    Playwright captured this viewport rendering state during execution on {deviceProfile.name || "the target device"}.
                    {failures.length > 0
                      ? ` ${failures.length} issue(s) or warnings were observed during layout and resource parsing.`
                      : " Page completed rendering without unhandled exceptions."}
                  </p>
                  <div className="flex flex-wrap gap-2 pt-2">
                    <span className="text-[11px] px-2 py-0.5 rounded bg-[#FAF9F5] border border-[#E6E2D9] text-[#6B6B65]">
                      Resolution: {deviceProfile.viewport_width || 390} x {deviceProfile.viewport_height || 844}
                    </span>
                    <span className="text-[11px] px-2 py-0.5 rounded bg-[#FAF9F5] border border-[#E6E2D9] text-[#6B6B65]">
                      Network: {deviceProfile.network_profile || "Fast 3G"}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-4 bg-[#FAF9F5] rounded-lg border border-[#E6E2D9] text-xs text-[#6B6B65] text-center">
                No screenshot artifact recorded for this run.
              </div>
            )}
          </div>

          {/* Detected Failures & Severity Ranking */}
          <div className="bg-white border border-[#E6E2D9] rounded-xl p-5 shadow-xs">
            <h3 className="text-xs font-semibold text-[#6B6B65] uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-[#C6534B]" />
              <span>Detected Failures & Demographic User Impact ({failures.length})</span>
            </h3>

            {failures.length > 0 ? (
              <div className="space-y-3">
                {failures.map((f: any, idx: number) => (
                  <div
                    key={f.id || idx}
                    className="p-3.5 bg-[#FAF9F5] border border-[#E6E2D9] rounded-lg flex flex-col sm:flex-row sm:items-start justify-between gap-3"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-[#FCEEEF] text-[#C6534B]">
                          {f.failure_type || "ISSUE"}
                        </span>
                        <h4 className="text-xs font-semibold text-[#252525]">{f.title}</h4>
                      </div>
                      <p className="text-xs text-[#6B6B65] font-mono whitespace-pre-wrap max-h-24 overflow-y-auto">
                        {f.message}
                      </p>
                      {f.error_signature && (
                        <span className="text-[10px] text-[#96948D] font-mono">
                          Signature: {f.error_signature}
                        </span>
                      )}
                    </div>

                    {f.users_hit_millions && (
                      <div className="text-right sm:border-l sm:border-[#E6E2D9] sm:pl-4 shrink-0">
                        <span className="text-xs font-bold text-[#C6534B] block">
                          ~{f.users_hit_millions}M Users
                        </span>
                        <span className="text-[10px] text-[#6B6B65]">Indian Demographics</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-4 bg-[#EAF4EE] text-[#36865A] rounded-lg border border-[#36865A]/20 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                <span>Clean execution: Zero fatal exceptions or runtime crashes recorded.</span>
              </div>
            )}
          </div>

          {/* Root Cause Analysis & Recommended Optimizations */}
          {recommendations.length > 0 && (
            <div className="bg-white border border-[#E6E2D9] rounded-xl p-5 shadow-xs">
              <h3 className="text-xs font-semibold text-[#6B6B65] uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-[#D97745]" />
                <span>Evidence-Grounded Root Cause Analysis & Optimizations ({recommendations.length})</span>
              </h3>

              <div className="space-y-4">
                {recommendations.map((rec: any, idx: number) => (
                  <div
                    key={rec.id || idx}
                    className="p-4 bg-[#FAF9F5] border border-[#E6E2D9] rounded-lg space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-[#252525]">{rec.title}</span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                          rec.impact === "CRITICAL"
                            ? "bg-[#FCEEEF] text-[#C6534B]"
                            : rec.impact === "HIGH"
                            ? "bg-[#FDF6EC] text-[#C58A35]"
                            : "bg-[#EEF4FB] text-[#557DAA]"
                        }`}
                      >
                        {rec.impact || "RECOMMENDED"}
                      </span>
                    </div>

                    <div className="text-xs text-[#6B6B65]">
                      <strong className="text-[#252525]">Probable Cause:</strong> {rec.probable_cause}
                    </div>

                    <div className="p-2.5 bg-white border border-[#E6E2D9] rounded text-xs font-mono text-[#252525]">
                      <span className="text-[10px] font-bold uppercase text-[#D97745] block font-sans mb-1">
                        Remediation Plan:
                      </span>
                      {rec.remediation}
                    </div>

                    {rec.verification_steps && (
                      <div className="text-[11px] text-[#6B6B65]">
                        <strong>Verification:</strong> {rec.verification_steps}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Technical Emulation Disclosures */}
          <div className="border-t border-[#E6E2D9] pt-4 text-[10px] text-[#96948D] leading-relaxed">
            <p>
              <strong>Technical Methodology Disclosure:</strong> This audit was performed using headless Chromium automation through Playwright. CPU throttling (rate multiplier: {deviceProfile.cpu_throttle_rate || 1}x) and network shaping ({deviceProfile.network_profile || "standard"}) were enforced via the Chrome DevTools Protocol (CDP). RAM and storage metrics are configuration constraints used for demographic indexing. Results are repeatable under identical emulation seeds.
            </p>
          </div>
        </div>
      </div>

      {/* Visual Evidence Lightbox */}
      {showEvidence && (
        <VisualEvidenceViewer
          isOpen={showEvidence}
          onClose={() => setShowEvidence(false)}
          failures={failures}
          defaultScreenshotUrl={activeRun.screenshot_url}
          deviceName={deviceProfile.name}
          targetUrl={targetUrl}
        />
      )}
    </div>
  );
}
