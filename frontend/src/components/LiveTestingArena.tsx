"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Play,
  RotateCcw,
  Square,
  Terminal,
  Activity,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Layers,
  Cpu,
  Wifi,
  ExternalLink,
  ChevronRight,
  ShieldCheck,
  FileText,
  GitCompare,
  Sparkles,
  Copy,
  Check,
  Globe,
  Share2
} from "lucide-react";
import { ApiClient } from "@/lib/api";
import AuditReportModal from "@/components/AuditReportModal";

const STAGES = [
  { id: 1, name: "Browser Initialization", desc: "Chromium headless allocation & CDP hardware throttling" },
  { id: 2, name: "Website Loading", desc: "DNS resolution, TLS handshake & DOMContentLoaded navigation" },
  { id: 3, name: "Request & Network Collection", desc: "Tracking subresource downloads, HTTP status & latency" },
  { id: 4, name: "Performance Measurement", desc: "Injecting PerformanceObserver for LCP, FCP, CLS & TTFB" },
  { id: 5, name: "Failure & Anomaly Detection", desc: "Monitoring console exceptions, CORS, CSP & visual shifts" },
  { id: 6, name: "Result Analysis", desc: "Evaluating degradation percentages & hardware bottlenecks" },
  { id: 7, name: "Report & Graph Generation", desc: "Persisting audit metrics & syncing Neo4j knowledge nodes" }
];

interface LogEntry {
  timestamp: string;
  level: "INFO" | "WARN" | "ERROR" | "METRIC" | "SUCCESS";
  message: string;
}

interface LiveTestingArenaProps {
  initialJobId?: string | null;
  onOpenAuditReport?: (jobId: string, runId?: string, payload?: any) => void;
  onOpenDeviceArena?: (url: string) => void;
  onOpenGraph?: () => void;
}

export default function LiveTestingArena({
  initialJobId,
  onOpenAuditReport,
  onOpenDeviceArena,
  onOpenGraph
}: LiveTestingArenaProps) {
  const [targetUrl, setTargetUrl] = useState("https://scan2eat.food");
  const [selectedTier, setSelectedTier] = useState("GOOD_BUDGET");
  const [jobId, setJobId] = useState<string | null>(initialJobId || null);
  const [jobStatus, setJobStatus] = useState<any>(null);
  const [currentStageId, setCurrentStageId] = useState(1);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copiedLogs, setCopiedLogs] = useState(false);
  const [liveMetrics, setLiveMetrics] = useState<Record<string, { value: number | string; rating?: string }>>({});
  const [localReportModalOpen, setLocalReportModalOpen] = useState(false);
  const [reportPayload, setReportPayload] = useState<any>(null);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const logContainerRef = useRef<HTMLDivElement | null>(null);

  // Auto scroll logs
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  // Elapsed timer handler
  useEffect(() => {
    if (isRunning) {
      const start = Date.now() - elapsedMs;
      timerRef.current = setInterval(() => {
        setElapsedMs(Date.now() - start);
      }, 50);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRunning]);

  // Polling active job
  useEffect(() => {
    if (!jobId) return;

    let active = true;
    let pollInterval: NodeJS.Timeout | null = null;

    const poll = async () => {
      try {
        const res = await ApiClient.getWebJobStatus(jobId);
        if (!active) return;

        setJobStatus(res);

        // Update stage
        if (res.stage_id) {
          setCurrentStageId(res.stage_id);
        } else if (res.status === "COMPLETED" || res.status === "COMPLETED_WITH_WARNINGS") {
          setCurrentStageId(7);
        }

        // Update logs if returned
        if (res.logs && Array.isArray(res.logs) && res.logs.length > 0) {
          setLogs(res.logs);
        }

        // Update live metrics from all available channels
        const incomingMetrics: Record<string, { value: number | string; rating?: string }> = {};

        if (res.metrics_summary && Object.keys(res.metrics_summary).length > 0) {
          Object.entries(res.metrics_summary).forEach(([k, v]) => {
            if (v && typeof v === "object" && "value" in (v as any)) {
              incomingMetrics[k] = { value: (v as any).value, rating: (v as any).rating };
            } else {
              incomingMetrics[k] = { value: v as any };
            }
          });
        }

        if (res.current_metrics && Object.keys(res.current_metrics).length > 0) {
          Object.entries(res.current_metrics).forEach(([k, v]) => {
            if (v && typeof v === "object" && "value" in (v as any)) {
              incomingMetrics[k] = { value: (v as any).value, rating: (v as any).rating };
            } else {
              incomingMetrics[k] = { value: v as any };
            }
          });
        }

        // Also parse live measured vitals from stream logs
        if (res.logs && Array.isArray(res.logs)) {
          res.logs.forEach((l: any) => {
            const match = l.message?.match(/Vital measured:\s*([A-Za-z_]+)\s*=\s*([0-9.]+)\s*(\w+)?\s*\(([^)]+)\)/);
            if (match) {
              const k = match[1];
              const val = parseFloat(match[2]);
              const rat = match[4];
              incomingMetrics[k] = { value: val, rating: rat };
            }
          });
        }

        if (Object.keys(incomingMetrics).length > 0) {
          setLiveMetrics((prev) => ({ ...prev, ...incomingMetrics }));
        }

        // Terminal states
        if (
          res.status === "COMPLETED" ||
          res.status === "COMPLETED_WITH_WARNINGS" ||
          res.status === "FAILED" ||
          res.status === "CANCELLED"
        ) {
          setIsRunning(false);
          if (res.duration_ms) {
            setElapsedMs(res.duration_ms);
          }
          if (pollInterval) clearInterval(pollInterval);
        }
      } catch (err: any) {
        console.error("Polling error in Live Arena:", err);
      }
    };

    poll();
    pollInterval = setInterval(poll, 1500);

    return () => {
      active = false;
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [jobId]);

  const handleStartTest = async () => {
    if (!targetUrl.trim()) return;
    setErrorMsg(null);
    setLogs([
      {
        timestamp: new Date().toLocaleTimeString(),
        level: "INFO",
        message: `Connecting to TierLens execution engine for ${targetUrl}...`
      }
    ]);
    setLiveMetrics({});
    setElapsedMs(0);
    setIsRunning(true);
    setCurrentStageId(1);

    try {
      const res = await ApiClient.runWebTest({
        target_url: targetUrl.trim(),
        tier: selectedTier
      });
      if (res && res.job_id) {
        setJobId(res.job_id);
      } else {
        throw new Error("No job_id returned from API server.");
      }
    } catch (err: any) {
      setIsRunning(false);
      setErrorMsg(err.message || "Failed to initiate live test.");
      setLogs((prev) => [
        ...prev,
        {
          timestamp: new Date().toLocaleTimeString(),
          level: "ERROR",
          message: `Launch error: ${err.message || "Execution dispatch rejected."}`
        }
      ]);
    }
  };

  const handleCancelTest = async () => {
    if (!jobId) return;
    try {
      await ApiClient.cancelWebJob(jobId);
      setIsRunning(false);
      setLogs((prev) => [
        ...prev,
        {
          timestamp: new Date().toLocaleTimeString(),
          level: "WARN",
          message: "User sent manual cancellation signal. Halted execution."
        }
      ]);
    } catch (err: any) {
      console.error("Cancel failed:", err);
    }
  };

  const handleCopyLogs = () => {
    const text = logs.map((l) => `[${l.timestamp}] [${l.level}] ${l.message}`).join("\n");
    navigator.clipboard.writeText(text);
    setCopiedLogs(true);
    setTimeout(() => setCopiedLogs(false), 2000);
  };

  const formatTimer = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const hundredths = Math.floor((ms % 1000) / 10);
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(hundredths).padStart(2, "0")}`;
  };

  const handleOpenReport = async () => {
    let payload = jobStatus?.comparison_data || jobStatus?.single_run_data;
    if (!payload && jobId) {
      try {
        const fresh = await ApiClient.getWebJobStatus(jobId);
        payload = fresh?.comparison_data || fresh?.single_run_data || fresh;
      } catch (e) {
        payload = jobStatus;
      }
    }
    if (!payload) payload = jobStatus;
    if (onOpenAuditReport) {
      onOpenAuditReport(jobId!, jobStatus?.test_run_id, payload);
    }
    setReportPayload(payload);
    setLocalReportModalOpen(true);
  };

  const isCompleted =
    jobStatus?.status === "COMPLETED" || jobStatus?.status === "COMPLETED_WITH_WARNINGS";
  const isFailed = jobStatus?.status === "FAILED";

  return (
    <div className="space-y-6">
      {/* Top Banner & Control Bar */}
      <div className="bg-white border border-[#E6E2D9] rounded-xl p-5 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="w-8 h-8 rounded-lg bg-[#F8E9DF] text-[#D97745] flex items-center justify-center font-bold">
                <Activity className="w-4 h-4 animate-pulse" />
              </span>
              <div>
                <h2 className="text-lg font-semibold text-[#252525]">Live Testing Arena</h2>
                <p className="text-xs text-[#6B6B65]">
                  Watch Playwright execution, CDP throttling, and metric collection in real time
                </p>
              </div>
            </div>
          </div>

          {/* Target inputs and buttons */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative min-w-[280px]">
              <Globe className="w-4 h-4 text-[#96948D] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="url"
                value={targetUrl}
                onChange={(e) => setTargetUrl(e.target.value)}
                placeholder="https://example.com"
                disabled={isRunning}
                className="w-full pl-9 pr-3 py-2 text-xs bg-[#FAF9F5] border border-[#E6E2D9] rounded-lg text-[#252525] focus:outline-hidden focus:border-[#D97745] disabled:opacity-60"
              />
            </div>

            <select
              value={selectedTier}
              onChange={(e) => setSelectedTier(e.target.value)}
              disabled={isRunning}
              className="text-xs py-2 px-3 bg-[#FAF9F5] border border-[#E6E2D9] rounded-lg text-[#252525] focus:outline-hidden focus:border-[#D97745] disabled:opacity-60"
            >
              <option value="GOOD_BUDGET">Good Budget (Galaxy A14 / 4x CPU)</option>
              <option value="ENTRY_LEVEL">Entry-Level (Redmi 9A / 8x CPU / Slow 3G)</option>
              <option value="BOTH">Dual Comparison (Budget vs Entry)</option>
            </select>

            {isRunning ? (
              <button
                onClick={handleCancelTest}
                className="flex items-center gap-1.5 px-4 py-2 bg-[#C6534B] hover:bg-[#b0453e] text-white text-xs font-semibold rounded-lg transition-colors shadow-xs"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
                <span>Cancel Test</span>
              </button>
            ) : (
              <button
                onClick={handleStartTest}
                className="flex items-center gap-1.5 px-4 py-2 bg-[#D97745] hover:bg-[#B95E32] text-white text-xs font-semibold rounded-lg transition-colors shadow-xs"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Launch Live Test</span>
              </button>
            )}
          </div>
        </div>

        {errorMsg && (
          <div className="mt-3 p-2.5 bg-[#FCEEEF] border border-[#C6534B]/30 rounded-lg text-xs text-[#C6534B] flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}
      </div>

      {/* Interactive Audit Report Completion Banner */}
      {isCompleted && (
        <div className="bg-[#EBF5F0] border border-[#CDE5D8] rounded-xl p-4 shadow-warm flex flex-col sm:flex-row items-center justify-between gap-4 animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-xl bg-[#36865A] text-white flex items-center justify-center shrink-0 shadow-xs">
              <CheckCircle2 className="w-6 h-6" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-[#252525]">
                  Test Execution Completed — Interactive Audit Report Ready
                </h3>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-[#36865A] text-white">
                  {jobStatus?.status}
                </span>
              </div>
              <p className="text-xs text-[#6B6B65] mt-0.5">
                All Web Vitals, resource metrics, anomalies, and Playwright screenshots were captured and synced with Neo4j.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleOpenReport}
              className="flex items-center gap-2 px-4 py-2 bg-[#D97745] hover:bg-[#B95E32] text-white text-xs font-bold rounded-lg transition-colors shadow-warm"
            >
              <FileText className="w-4 h-4" />
              <span>Open Interactive Audit Report</span>
            </button>
            {onOpenGraph && (
              <button
                onClick={onOpenGraph}
                className="flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-[#FAF9F5] border border-[#E6E2D9] text-[#252525] text-xs font-semibold rounded-lg transition-colors"
              >
                <Share2 className="w-3.5 h-3.5 text-[#557DAA]" />
                <span>Neo4j Graph</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Execution Tracker: Status Header & Timer */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* State Status Card */}
        <div className="bg-white border border-[#E6E2D9] rounded-xl p-4 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-semibold text-[#6B6B65] uppercase tracking-wider block">
              Current Stage
            </span>
            <span className="text-sm font-semibold text-[#252525] mt-0.5 block truncate max-w-[180px]">
              {jobStatus?.stage || (isRunning ? STAGES[currentStageId - 1].name : "Ready to Start")}
            </span>
          </div>
          <div className="w-9 h-9 rounded-lg bg-[#F8E9DF] text-[#D97745] flex items-center justify-center font-bold">
            {currentStageId}/7
          </div>
        </div>

        {/* Stopwatch Timer */}
        <div className="bg-white border border-[#E6E2D9] rounded-xl p-4 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-semibold text-[#6B6B65] uppercase tracking-wider block">
              Elapsed Time
            </span>
            <span className="text-base font-mono font-bold text-[#252525] mt-0.5 block">
              {formatTimer(elapsedMs)}
            </span>
          </div>
          <div className="w-9 h-9 rounded-lg bg-[#FAF9F5] border border-[#E6E2D9] text-[#6B6B65] flex items-center justify-center">
            <Clock className={`w-4 h-4 ${isRunning ? "animate-spin" : ""}`} />
          </div>
        </div>

        {/* Emulation Profile */}
        <div className="bg-white border border-[#E6E2D9] rounded-xl p-4 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-semibold text-[#6B6B65] uppercase tracking-wider block">
              Target Hardware
            </span>
            <span className="text-xs font-semibold text-[#252525] mt-0.5 block truncate max-w-[160px]">
              {selectedTier === "ENTRY_LEVEL" ? "Entry-Level (2GB / 8x)" : "Budget Android (4GB / 4x)"}
            </span>
          </div>
          <div className="w-9 h-9 rounded-lg bg-[#FAF9F5] border border-[#E6E2D9] text-[#6B6B65] flex items-center justify-center">
            <Cpu className="w-4 h-4" />
          </div>
        </div>

        {/* Test Result Verdict */}
        <div className="bg-white border border-[#E6E2D9] rounded-xl p-4 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-semibold text-[#6B6B65] uppercase tracking-wider block">
              Result Status
            </span>
            <span
              className={`text-xs font-semibold mt-0.5 block ${
                isCompleted
                  ? "text-[#36865A]"
                  : isFailed
                  ? "text-[#C6534B]"
                  : isRunning
                  ? "text-[#D97745]"
                  : "text-[#6B6B65]"
              }`}
            >
              {jobStatus?.status ? jobStatus.status.replace("_", " ") : isRunning ? "IN PROGRESS" : "IDLE"}
            </span>
          </div>
          <div
            className={`w-9 h-9 rounded-lg flex items-center justify-center ${
              isCompleted
                ? "bg-[#EAF4EE] text-[#36865A]"
                : isFailed
                ? "bg-[#FCEEEF] text-[#C6534B]"
                : "bg-[#FAF9F5] border border-[#E6E2D9] text-[#6B6B65]"
            }`}
          >
            {isCompleted ? (
              <CheckCircle2 className="w-4 h-4" />
            ) : isFailed ? (
              <AlertTriangle className="w-4 h-4" />
            ) : (
              <ShieldCheck className="w-4 h-4" />
            )}
          </div>
        </div>
      </div>

      {/* 7 Visual Stages Pipeline */}
      <div className="bg-white border border-[#E6E2D9] rounded-xl p-5 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xs font-semibold text-[#6B6B65] uppercase tracking-wider flex items-center gap-2">
            <Layers className="w-3.5 h-3.5" />
            <span>Interactive Execution Pipeline (7 Stages)</span>
          </h3>
          <span className="text-xs font-mono font-medium text-[#D97745]">
            Progress: {Math.round((currentStageId / 7) * 100)}%
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-7 gap-2">
          {STAGES.map((s) => {
            const isDone = s.id < currentStageId || isCompleted;
            const isCurrent = s.id === currentStageId && isRunning;
            const isPending = s.id > currentStageId && !isCompleted;

            return (
              <div
                key={s.id}
                className={`p-3 rounded-lg border text-left transition-all relative ${
                  isCurrent
                    ? "bg-[#F8E9DF] border-[#D97745] text-[#252525] shadow-xs"
                    : isDone
                    ? "bg-[#EAF4EE]/60 border-[#36865A]/30 text-[#252525]"
                    : "bg-[#FAF9F5] border-[#E6E2D9] text-[#96948D]"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span
                    className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${
                      isCurrent
                        ? "bg-[#D97745] text-white"
                        : isDone
                        ? "bg-[#36865A] text-white"
                        : "bg-[#EEECE5] text-[#6B6B65]"
                    }`}
                  >
                    #{s.id}
                  </span>
                  {isDone ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#36865A]" />
                  ) : isCurrent ? (
                    <span className="w-2 h-2 rounded-full bg-[#D97745] animate-ping" />
                  ) : (
                    <span className="w-2 h-2 rounded-full bg-[#E6E2D9]" />
                  )}
                </div>
                <h4 className="text-xs font-semibold leading-tight mb-1">{s.name}</h4>
                <p className="text-[10px] text-[#6B6B65] line-clamp-2 leading-relaxed">
                  {s.desc}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Two Columns: Live Metrics On Left, Live Streaming Console On Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Live Discovered Metrics */}
        <div className="lg:col-span-5 bg-white border border-[#E6E2D9] rounded-xl p-5 shadow-xs flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs font-semibold text-[#6B6B65] uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-[#D97745]" />
              <span>Real-Time Collected Vitals</span>
            </h3>
            <span className="text-[11px] text-[#96948D]">
              {Object.keys(liveMetrics).length} metrics active
            </span>
          </div>

          <div className="space-y-3 flex-1">
            {[
              { key: "TTFB", label: "Server Response (TTFB)", unit: "ms", goodThreshold: 800 },
              { key: "FCP", label: "First Contentful Paint", unit: "ms", goodThreshold: 1800 },
              { key: "LCP", label: "Largest Contentful Paint", unit: "ms", goodThreshold: 2500 },
              { key: "CLS", label: "Cumulative Layout Shift", unit: "", goodThreshold: 0.1 },
              { key: "PAGE_LOAD_TIME", label: "Full Page Load Time", unit: "ms", goodThreshold: 5000 },
              { key: "TOTAL_RESOURCES", label: "Subresource Assets", unit: "reqs", goodThreshold: 60 },
              { key: "TRANSFER_SIZE_KB", label: "Total Transferred", unit: "KB", goodThreshold: 1000 },
              { key: "LONG_TASKS_COUNT", label: "Main Thread Long Tasks", unit: "tasks", goodThreshold: 2 },
            ].map((spec) => {
              const metricItem = liveMetrics[spec.key];
              const val = metricItem?.value;
              const rating = metricItem?.rating;
              const hasVal = val !== undefined;

              let badgeColor = "bg-[#FAF9F5] text-[#96948D] border-[#E6E2D9]";
              let ratingText = rating;
              if (rating) {
                const rUpper = rating.toUpperCase();
                if (rUpper.includes("GOOD")) {
                  badgeColor = "bg-[#EBF5F0] text-[#36865A] border-[#CDE5D8]";
                  ratingText = "Good";
                } else if (rUpper.includes("NEED") || rUpper.includes("IMPROVE")) {
                  badgeColor = "bg-[#FDF3E7] text-[#C58A35] border-[#F2D7B3]";
                  ratingText = "Needs Work";
                } else if (rUpper.includes("POOR") || rUpper.includes("FAIL")) {
                  badgeColor = "bg-[#FBEBEB] text-[#C6534B] border-[#F0C4C1]";
                  ratingText = "Poor";
                }
              }

              return (
                <div
                  key={spec.key}
                  className={`p-3 rounded-lg border flex items-center justify-between transition-all ${
                    hasVal
                      ? "bg-[#FAF9F5] border-[#E6E2D9] shadow-2xs"
                      : "bg-[#FAF9F5]/40 border-[#E6E2D9]/60 opacity-60"
                  }`}
                >
                  <div>
                    <span className="text-xs font-medium text-[#252525] block">{spec.label}</span>
                    <span className="text-[10px] text-[#96948D]">{spec.key}</span>
                  </div>
                  <div className="text-right flex items-center gap-2">
                    {hasVal ? (
                      <>
                        <span className="text-sm font-mono font-bold text-[#252525]">
                          {typeof val === "number" ? val.toLocaleString() : val} {spec.unit}
                        </span>
                        {ratingText && (
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${badgeColor}`}>
                            {ratingText}
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="text-xs font-mono text-[#96948D] animate-pulse">
                        Waiting...
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Quick link on completion */}
          {isCompleted && (
            <div className="mt-4 pt-4 border-t border-[#E6E2D9] space-y-2">
              <button
                onClick={handleOpenReport}
                className="w-full flex items-center justify-center gap-1.5 py-2 px-3 bg-[#D97745] hover:bg-[#B95E32] text-white text-xs font-semibold rounded-lg transition-colors shadow-xs"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Open Interactive Audit Report</span>
              </button>
            </div>
          )}
        </div>

        {/* Right: Live Terminal & Streaming Event Logs */}
        <div className="lg:col-span-7 bg-[#252525] rounded-xl p-4 shadow-xs flex flex-col font-mono text-xs">
          <div className="flex items-center justify-between pb-3 border-b border-[#3A3A3A] mb-3">
            <div className="flex items-center gap-2 text-[#EEECE5]">
              <Terminal className="w-4 h-4 text-[#D97745]" />
              <span className="font-semibold text-xs tracking-wider">LIVE EXECUTION LOGS</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleCopyLogs}
                className="flex items-center gap-1 text-[11px] text-[#96948D] hover:text-[#EEECE5] px-2 py-1 rounded bg-[#333333] transition-colors"
                title="Copy all logs"
              >
                {copiedLogs ? <Check className="w-3 h-3 text-[#36865A]" /> : <Copy className="w-3 h-3" />}
                <span>{copiedLogs ? "Copied" : "Copy"}</span>
              </button>
              <span className="flex items-center gap-1.5 text-[11px] text-[#36865A] bg-[#36865A]/15 px-2 py-0.5 rounded">
                <span className="w-1.5 h-1.5 rounded-full bg-[#36865A] animate-ping" />
                <span>STREAM</span>
              </span>
            </div>
          </div>

          <div
            ref={logContainerRef}
            className="flex-1 min-h-[340px] max-h-[460px] overflow-y-auto space-y-1.5 pr-2 font-mono text-[11px] leading-relaxed"
          >
            {logs.length === 0 ? (
              <div className="text-[#6B6B65] py-8 text-center">
                Waiting for engine launch. Click "Launch Live Test" to watch CDP execution stream.
              </div>
            ) : (
              logs.map((l, i) => {
                let colorClass = "text-[#E0DFD5]";
                if (l.level === "ERROR") colorClass = "text-[#E57373]";
                else if (l.level === "WARN") colorClass = "text-[#FFB74D]";
                else if (l.level === "METRIC") colorClass = "text-[#D97745] font-semibold";
                else if (l.level === "SUCCESS") colorClass = "text-[#81C784] font-semibold";

                return (
                  <div key={i} className="flex items-start gap-2">
                    <span className="text-[#6B6B65] shrink-0">[{l.timestamp}]</span>
                    <span
                      className={`text-[10px] px-1 rounded uppercase font-bold shrink-0 ${
                        l.level === "ERROR"
                          ? "bg-[#C6534B]/30 text-[#E57373]"
                          : l.level === "WARN"
                          ? "bg-[#C58A35]/30 text-[#FFB74D]"
                          : l.level === "METRIC"
                          ? "bg-[#D97745]/30 text-[#D97745]"
                          : l.level === "SUCCESS"
                          ? "bg-[#36865A]/30 text-[#81C784]"
                          : "bg-[#444444] text-[#AAA]"
                      }`}
                    >
                      {l.level}
                    </span>
                    <span className={`${colorClass} break-all`}>{l.message}</span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Local Audit Report Modal Fallback */}
      {localReportModalOpen && (
        <AuditReportModal
          isOpen={localReportModalOpen}
          onClose={() => setLocalReportModalOpen(false)}
          reportData={reportPayload || jobStatus?.comparison_data || jobStatus?.single_run_data || jobStatus}
        />
      )}
    </div>
  );
}
