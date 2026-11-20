"use client";

import React, { useState, useEffect } from "react";
import {
  Activity,
  Layers,
  Smartphone,
  Globe,
  Sliders,
  AlertOctagon,
  Brain,
  CheckCircle2,
  GitCompare,
  Terminal,
  ShieldCheck,
  FileCode,
  Settings,
  BookOpen,
  History,
  TrendingDown,
  Upload,
  Play,
  RotateCcw,
  Check,
  X,
  ExternalLink,
  Info,
  Database,
  Cpu,
  Wifi,
  Radio,
  FileText
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import IntelligenceGraph from "@/components/IntelligenceGraph";
import { ApiClient } from "@/lib/api";

type TabType =
  | "overview"
  | "web_test"
  | "android_test"
  | "compare"
  | "device_lab"
  | "failures"
  | "rca"
  | "graph"
  | "optimizations"
  | "history"
  | "reports"
  | "settings"
  | "docs";

export default function TierLensApp() {
  const [activeTab, setActiveTab] = useState<TabType>("overview");
  const [systemHealth, setSystemHealth] = useState<any>(null);
  const [deviceLabStatus, setDeviceLabStatus] = useState<any>(null);

  // Web Testing Form State
  const [testUrl, setTestUrl] = useState("https://example.com");
  const [selectedTier, setSelectedTier] = useState("BOTH");
  const [isRunningTest, setIsRunningTest] = useState(false);
  const [testStep, setTestStep] = useState<string | null>(null);
  const [activeJob, setActiveJob] = useState<{
    job_id: string;
    status: string;
    stage: string;
    progress_message: string;
    error_category?: string | null;
    error?: string | null;
  } | null>(null);
  const [testResult, setTestResult] = useState<any>(null);
  const [comparisonData, setComparisonData] = useState<any>(null);
  const [graphData, setGraphData] = useState<any>({ nodes: [], edges: [], connected: false });
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  // APK Upload State
  const [apkFile, setApkFile] = useState<File | null>(null);
  const [apkManifest, setApkManifest] = useState<any>(null);
  const [isUploadingApk, setIsUploadingApk] = useState(false);

  // Recommendations state
  const [recommendations, setRecommendations] = useState<any[]>([]);

  const [isCancelling, setIsCancelling] = useState(false);

  const ensureAuth = async () => {
    try {
      const token = ApiClient.getToken();
      if (!token) {
        try {
          const res = await ApiClient.login({ email: "demo@tierlens.com", password: "Password123!" });
          ApiClient.setToken(res.access_token);
        } catch {
          const reg = await ApiClient.register({ email: "demo@tierlens.com", password: "Password123!", full_name: "Demo Developer" });
          ApiClient.setToken(reg.access_token);
        }
      }
    } catch (e) {
      console.warn("Auto demo session initialization notice:", e);
    }
  };

  const refreshHealth = async () => {
    try {
      const health = await ApiClient.getHealth();
      setSystemHealth(health);
    } catch (e: any) {
      setSystemHealth({
        status: "degraded",
        database: { status: "offline", error: e.message },
        neo4j: { connected: false },
        redis: { connected: false },
        android_adb: { available: false, status: "SETUP_REQUIRED" }
      });
    }

    try {
      const devLab = await ApiClient.getDeviceLabStatus();
      setDeviceLabStatus(devLab);
    } catch (e) {
      // Ignored
    }

    try {
      const gStatus = await ApiClient.getGraphStatus();
      setGraphData((prev: any) => ({ ...prev, connected: gStatus.connected, error: gStatus.error }));
    } catch (e) {
      // Ignored
    }
  };

  useEffect(() => {
    ensureAuth().finally(() => {
      refreshHealth();
    });
  }, []);

  const handleCancelJob = async () => {
    if (!activeJob || isCancelling) return;
    setIsCancelling(true);
    try {
      await ApiClient.cancelWebJob(activeJob.job_id);
      setTestStep("Cancellation requested...");
    } catch (err: any) {
      setErrorBanner(err.message || "Failed to cancel job.");
      setIsCancelling(false);
    }
  };

  const handleExecuteWebTest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testUrl) return;

    await ensureAuth();
    setErrorBanner(null);
    setIsRunningTest(true);
    setTestStep("Submitting test to background queue...");

    try {
      const queueRes = await ApiClient.runWebTest({
        target_url: testUrl,
        tier: selectedTier,
      });

      const jobId = queueRes.job_id;
      setActiveJob({
        job_id: jobId,
        status: queueRes.status || "QUEUED",
        stage: queueRes.stage || "Queue Dispatch",
        progress_message: queueRes.message || "Job accepted for execution.",
      });
      setTestStep(`[${queueRes.status || "QUEUED"}] ${queueRes.message || "Job accepted"}`);

      // Poll background execution status until completion, failure, or cancellation
      let finished = false;
      let consecutiveErrors = 0;
      const MAX_CONSECUTIVE_ERRORS = 5;

      while (!finished) {
        await new Promise((resolve) => setTimeout(resolve, 1500));

        try {
          const statusRes = await ApiClient.getWebJobStatus(jobId);
          consecutiveErrors = 0;

          setActiveJob({
            job_id: statusRes.job_id,
            status: statusRes.status,
            stage: statusRes.stage,
            progress_message: statusRes.progress_message,
            error_category: statusRes.error_category,
            error: statusRes.error,
          });
          setTestStep(`[${statusRes.status}] ${statusRes.stage}: ${statusRes.progress_message}`);

          const isSuccessState = ["COMPLETED", "COMPLETED_WITH_WARNINGS", "PARTIAL"].includes(statusRes.status);

          if (isSuccessState) {
            finished = true;
            setTestResult(statusRes);

            // 1. Immediately hydrate comparison data if embedded in response
            if (statusRes.comparison_data) {
              setComparisonData(statusRes.comparison_data);
              if (statusRes.comparison_data.recommendations) {
                setRecommendations(statusRes.comparison_data.recommendations);
              }
            }

            // 2. Hydrate single run data if embedded
            if (statusRes.single_run_data) {
              if (statusRes.single_run_data.recommendations) {
                setRecommendations(statusRes.single_run_data.recommendations);
              }
            }

            // 3. Fallback to separate endpoints if not embedded
            if (statusRes.mode === "DUAL_COMPARISON" && statusRes.comparison_group_id && !statusRes.comparison_data) {
              try {
                setTestStep("Loading comparative metrics diff...");
                const comp = await ApiClient.getComparison(statusRes.comparison_group_id);
                setComparisonData(comp);

                if (comp.entry_level_run?.id) {
                  const recs = await ApiClient.getRunRecommendations(comp.entry_level_run.id);
                  setRecommendations(recs);
                }

                if (comp.entry_level_run?.project_id) {
                  const g = await ApiClient.getProjectGraph(comp.entry_level_run.project_id);
                  setGraphData(g);
                }
              } catch (loadErr) {
                console.warn("Could not load external comparison endpoints:", loadErr);
              }
            } else if (statusRes.test_run_id && !statusRes.single_run_data) {
              try {
                setTestStep("Loading single device recommendations...");
                const recs = await ApiClient.getRunRecommendations(statusRes.test_run_id);
                setRecommendations(recs);
              } catch (loadErr) {
                console.warn("Could not load recommendations:", loadErr);
              }
            }

            if (statusRes.status === "PARTIAL") {
              setErrorBanner(`[PARTIAL EXECUTION] ${statusRes.progress_message}`);
            }
          } else if (statusRes.status === "FAILED") {
            finished = true;
            setTestResult(statusRes);
            const errMsg = statusRes.error_category 
              ? `[${statusRes.error_category}] ${statusRes.progress_message || statusRes.error}`
              : (statusRes.error || statusRes.progress_message || "Execution halted.");
            setErrorBanner(errMsg);
            if (statusRes.test_run_id) {
              try {
                const recs = await ApiClient.getRunRecommendations(statusRes.test_run_id);
                setRecommendations(recs);
              } catch (_) {}
            }
          } else if (statusRes.status === "CANCELLED") {
            finished = true;
            setErrorBanner("Test execution was cancelled.");
          }
        } catch (err: any) {
          consecutiveErrors++;
          if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS || err.message?.includes("failed")) {
            throw err;
          }
        }
      }
    } catch (err: any) {
      setErrorBanner(err.message || "Failed to execute test.");
    } finally {
      setIsRunningTest(false);
      setIsCancelling(false);
      setTestStep(null);
    }
  };

  const handleApkUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setApkFile(file);
    setIsUploadingApk(true);
    setErrorBanner(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await ApiClient.uploadApk(formData);
      setApkManifest(res.manifest);
    } catch (err: any) {
      setErrorBanner(err.message || "Failed to parse APK.");
      setApkFile(null);
    } finally {
      setIsUploadingApk(false);
    }
  };

  const handleStatusUpdate = async (recId: string, status: string) => {
    try {
      await ApiClient.updateRecommendationStatus(recId, status);
      setRecommendations(recs =>
        recs.map(r => r.id === recId ? { ...r, status } : r)
      );
    } catch (err: any) {
      setErrorBanner(err.message);
    }
  };

  const comparisonChartData = comparisonData?.metrics_diff
    ? Object.entries(comparisonData.metrics_diff).map(([key, val]: [string, any]) => ({
        name: key,
        "Good Budget": val.good_budget,
        "Entry-Level": val.entry_level,
        unit: val.unit,
        pct: val.pct_change
      }))
    : [];

  return (
    <div className="flex h-screen bg-slate-50 text-slate-800 overflow-hidden font-sans">
      {/* Sidebar Navigation */}
      <aside className="w-64 bg-white border-r border-slate-200 flex flex-col justify-between shrink-0 shadow-sm">
        <div>
          {/* Logo & Brand */}
          <div className="p-5 border-b border-slate-100 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center font-black text-white text-base shadow-sm">
              TL
            </div>
            <div>
              <h1 className="font-extrabold text-base tracking-tight text-slate-900 flex items-center gap-1.5">
                TierLens <span className="text-[10px] bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.2 rounded font-mono">v1.0</span>
              </h1>
              <p className="text-[11px] text-slate-500 font-medium">Device Intelligence Platform</p>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="p-3 space-y-1 overflow-y-auto max-h-[calc(100vh-190px)]">
            <div className="text-[10px] font-bold text-slate-400 uppercase px-3 py-1 tracking-wider">
              Testing Engines
            </div>
            <button
              onClick={() => setActiveTab("overview")}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition ${
                activeTab === "overview" ? "bg-blue-50 text-blue-700 font-semibold" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`}
            >
              <Activity className="w-4 h-4 text-blue-600" />
              Main Dashboard
            </button>
            <button
              onClick={() => setActiveTab("web_test")}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition ${
                activeTab === "web_test" ? "bg-blue-50 text-blue-700 font-semibold" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`}
            >
              <Globe className="w-4 h-4 text-blue-600" />
              Website Testing
            </button>
            <button
              onClick={() => setActiveTab("android_test")}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition ${
                activeTab === "android_test" ? "bg-blue-50 text-blue-700 font-semibold" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`}
            >
              <Smartphone className="w-4 h-4 text-emerald-600" />
              Android APK Testing
            </button>
            <button
              onClick={() => setActiveTab("device_lab")}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition ${
                activeTab === "device_lab" ? "bg-blue-50 text-blue-700 font-semibold" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`}
            >
              <Radio className="w-4 h-4 text-purple-600" />
              Device Lab & Tiers
            </button>

            <div className="text-[10px] font-bold text-slate-400 uppercase px-3 pt-4 pb-1 tracking-wider">
              Analysis & Intelligence
            </div>
            <button
              onClick={() => setActiveTab("compare")}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition ${
                activeTab === "compare" ? "bg-blue-50 text-blue-700 font-semibold" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`}
            >
              <GitCompare className="w-4 h-4 text-blue-600" />
              Device Comparison
            </button>
            <button
              onClick={() => setActiveTab("failures")}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition ${
                activeTab === "failures" ? "bg-blue-50 text-blue-700 font-semibold" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`}
            >
              <AlertOctagon className="w-4 h-4 text-red-600" />
              Failure Explorer
            </button>
            <button
              onClick={() => setActiveTab("rca")}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition ${
                activeTab === "rca" ? "bg-blue-50 text-blue-700 font-semibold" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`}
            >
              <Brain className="w-4 h-4 text-pink-600" />
              Root Cause Analysis
            </button>
            <button
              onClick={() => setActiveTab("graph")}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition ${
                activeTab === "graph" ? "bg-blue-50 text-blue-700 font-semibold" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`}
            >
              <Database className="w-4 h-4 text-amber-600" />
              Neo4j Intelligence Graph
            </button>
            <button
              onClick={() => setActiveTab("optimizations")}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition ${
                activeTab === "optimizations" ? "bg-blue-50 text-blue-700 font-semibold" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`}
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              Optimization Workflow
            </button>

            <div className="text-[10px] font-bold text-slate-400 uppercase px-3 pt-4 pb-1 tracking-wider">
              Governance & Docs
            </div>
            <button
              onClick={() => setActiveTab("reports")}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition ${
                activeTab === "reports" ? "bg-blue-50 text-blue-700 font-semibold" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`}
            >
              <FileText className="w-4 h-4 text-slate-500" />
              Audit Reports
            </button>
            <button
              onClick={() => setActiveTab("settings")}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition ${
                activeTab === "settings" ? "bg-blue-50 text-blue-700 font-semibold" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`}
            >
              <Settings className="w-4 h-4 text-slate-500" />
              Settings
            </button>
            <button
              onClick={() => setActiveTab("docs")}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition ${
                activeTab === "docs" ? "bg-blue-50 text-blue-700 font-semibold" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`}
            >
              <BookOpen className="w-4 h-4 text-slate-500" />
              Documentation
            </button>
          </nav>
        </div>

        {/* Real Data Policy Indicator */}
        <div className="p-3.5 border-t border-slate-100 bg-slate-50">
          <div className="flex items-center gap-2 text-[11px] text-emerald-700 font-semibold mb-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>Real Data Policy: STRICT</span>
          </div>
          <p className="text-[10px] text-slate-500 leading-tight">
            No simulated or fabricated data. All metrics are derived from actual browser & device instrumentation.
          </p>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {/* Top Header */}
        <header className="h-16 border-b border-slate-200 bg-white/90 backdrop-blur px-8 flex items-center justify-between shrink-0 sticky top-0 z-30">
          <div className="flex items-center gap-4">
            <h2 className="text-sm font-bold text-slate-900 capitalize tracking-wide">
              {activeTab.replace("_", " ")}
            </h2>
            {testStep && (
              <div className="flex items-center gap-2 px-3 py-1 bg-blue-50 border border-blue-200 rounded-full text-xs font-mono text-blue-700">
                <Terminal className="w-3.5 h-3.5 animate-pulse text-blue-600 shrink-0" />
                <span className="truncate max-w-md">{testStep}</span>
                {activeJob && (
                  <button
                    onClick={handleCancelJob}
                    disabled={isCancelling}
                    className="ml-2 text-[10px] font-bold uppercase tracking-wider text-red-600 hover:text-red-800 bg-red-50 hover:bg-red-100 disabled:opacity-50 border border-red-200 px-2 py-0.5 rounded transition"
                  >
                    {isCancelling ? "Cancelling..." : "Cancel"}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Infrastructure Health Status Badges */}
          <div className="flex items-center gap-2.5 text-xs font-mono">
            <div
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md border ${
                systemHealth?.database?.status === "connected" || systemHealth?.database?.status === "connected_fallback"
                  ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                  : "bg-red-50 border-red-200 text-red-700"
              }`}
              title="Database Status"
            >
              <Database className="w-3 h-3" />
              <span>DB: {systemHealth?.database?.database_type || "Postgres"}</span>
            </div>

            <div
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md border ${
                systemHealth?.neo4j?.connected
                  ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                  : "bg-amber-50 border-amber-200 text-amber-700"
              }`}
              title="Neo4j Graph Database Status"
            >
              <Layers className="w-3 h-3" />
              <span>Neo4j: {systemHealth?.neo4j?.connected ? "Online" : "Disconnected"}</span>
            </div>

            <div
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md border ${
                systemHealth?.android_adb?.available
                  ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                  : "bg-slate-100 border-slate-200 text-slate-600"
              }`}
              title="Android ADB Hardware Bridge"
            >
              <Smartphone className="w-3 h-3" />
              <span>ADB: {systemHealth?.android_adb?.available ? "Ready" : "Setup Req"}</span>
            </div>

            <button
              onClick={refreshHealth}
              className="p-1.5 hover:bg-slate-100 text-slate-500 hover:text-slate-800 rounded transition"
              title="Refresh Health"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </header>

        {/* Global Error Banner */}
        {errorBanner && (
          <div className="m-6 mb-0 p-4 bg-red-50 border border-red-200 rounded-xl flex items-center justify-between text-xs text-red-800">
            <div className="flex items-center gap-3">
              <AlertOctagon className="w-4 h-4 text-red-600 shrink-0" />
              <span>{errorBanner}</span>
            </div>
            <button onClick={() => setErrorBanner(null)} className="hover:text-red-950 font-bold">
              ✕
            </button>
          </div>
        )}

        {/* Views */}
        <div className="p-8 max-w-7xl mx-auto w-full space-y-8">
          {/* TAB 1: OVERVIEW & DASHBOARD */}
          {activeTab === "overview" && (
            <div className="space-y-6">
              {/* Clean White Hero Banner */}
              <div className="rounded-2xl bg-white p-8 border border-slate-200 shadow-sm">
                <div className="max-w-2xl">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-xs font-semibold mb-4">
                    <ShieldCheck className="w-3.5 h-3.5" /> Real Device Performance Intelligence
                  </div>
                  <h1 className="text-2xl font-bold text-slate-900 tracking-tight mb-2">
                    Measure how your application runs on <span className="text-blue-600">Entry-Level</span> devices.
                  </h1>
                  <p className="text-slate-600 text-xs leading-relaxed mb-6">
                    Developers build on powerful computers and high-end phones. Actual users run entry-level devices with slower CPUs, 2GB RAM, and unstable mobile networks. TierLens exposes performance degradation and crashes across device tiers.
                  </p>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setActiveTab("web_test")}
                      className="px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs transition flex items-center gap-2 shadow-sm"
                    >
                      <Play className="w-3.5 h-3.5 fill-white" /> Start Dual Web Test
                    </button>
                    <button
                      onClick={() => setActiveTab("android_test")}
                      className="px-4 py-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium text-xs transition flex items-center gap-2 border border-slate-200"
                    >
                      <Upload className="w-3.5 h-3.5" /> Upload Android APK
                    </button>
                  </div>
                </div>
              </div>

              {/* Clean Stat Cards */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="p-5 rounded-xl bg-white border border-slate-200 shadow-sm">
                  <span className="text-xs text-slate-500 font-medium">Core Web Vitals Engine</span>
                  <div className="text-xl font-bold text-slate-900 mt-1">Playwright + CDP</div>
                  <div className="text-[11px] text-blue-700 mt-2 font-medium flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> 4x & 8x CPU Throttling
                  </div>
                </div>

                <div className="p-5 rounded-xl bg-white border border-slate-200 shadow-sm">
                  <span className="text-xs text-slate-500 font-medium">Android APK Engine</span>
                  <div className="text-xl font-bold text-slate-900 mt-1">ADB + Logcat</div>
                  <div className="text-[11px] text-emerald-700 mt-2 font-medium flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> ANR & Memory Profiling
                  </div>
                </div>

                <div className="p-5 rounded-xl bg-white border border-slate-200 shadow-sm">
                  <span className="text-xs text-slate-500 font-medium">Knowledge Graph</span>
                  <div className="text-xl font-bold text-slate-900 mt-1">Neo4j Bolt 5.20</div>
                  <div className="text-[11px] text-amber-700 mt-2 font-medium flex items-center gap-1">
                    <Layers className="w-3.5 h-3.5" /> Signature Deduplication
                  </div>
                </div>

                <div className="p-5 rounded-xl bg-white border border-slate-200 shadow-sm">
                  <span className="text-xs text-slate-500 font-medium">Root Cause Engine</span>
                  <div className="text-xl font-bold text-slate-900 mt-1">Deterministic Rules</div>
                  <div className="text-[11px] text-pink-700 mt-2 font-medium flex items-center gap-1">
                    <Brain className="w-3.5 h-3.5" /> Zero-Hallucination Fallback
                  </div>
                </div>
              </div>

              {/* Quick URL Test Bar */}
              <div className="p-6 rounded-xl bg-white border border-slate-200 shadow-sm">
                <h3 className="text-sm font-bold text-slate-900 mb-1">Execute Immediate Dual-Tier Comparison</h3>
                <p className="text-xs text-slate-500 mb-4">
                  Enter any public HTTPS URL. TierLens executes headless Chromium instances in parallel across Good Budget (4x CPU, Fast 3G) and Entry-Level (8x CPU, Slow 3G).
                </p>
                <form onSubmit={handleExecuteWebTest} className="flex gap-3">
                  <input
                    type="url"
                    value={testUrl}
                    onChange={e => setTestUrl(e.target.value)}
                    placeholder="https://example.com"
                    required
                    className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 text-xs text-slate-900 focus:outline-none focus:border-blue-600 font-mono"
                  />
                  <button
                    type="submit"
                    disabled={isRunningTest}
                    className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium text-xs rounded-lg transition shrink-0 flex items-center gap-2 shadow-sm"
                  >
                    {isRunningTest ? <RotateCcw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5 fill-white" />}
                    {isRunningTest ? "Running Test..." : "Start Dual Test"}
                  </button>
                </form>
              </div>
            </div>
          )}

          {/* TAB 2: WEBSITE TESTING */}
          {activeTab === "web_test" && (
            <div className="space-y-6">
              <div className="p-6 rounded-xl bg-white border border-slate-200 shadow-sm">
                <h2 className="text-base font-bold text-slate-900 mb-1">Engine A: Website Performance Testing</h2>
                <p className="text-xs text-slate-500 mb-6">
                  Executes automated Playwright tests with real Chrome DevTools Protocol network and CPU throttling.
                </p>

                <form onSubmit={handleExecuteWebTest} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">Target Application URL</label>
                    <input
                      type="url"
                      value={testUrl}
                      onChange={e => setTestUrl(e.target.value)}
                      placeholder="https://your-domain.com"
                      required
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-xs text-slate-900 focus:outline-none focus:border-blue-600 font-mono"
                    />
                    <span className="text-[11px] text-slate-500 mt-1 block">
                      SSRF Protection: Private IP subnets (10.0.0.0/8, 192.168.0.0/16), localhost, and metadata endpoints are strictly blocked.
                    </span>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">Testing Profile Mode</label>
                    <div className="grid grid-cols-3 gap-3">
                      <div
                        onClick={() => setSelectedTier("BOTH")}
                        className={`p-3.5 rounded-lg border cursor-pointer transition ${
                          selectedTier === "BOTH" ? "bg-blue-50 border-blue-600 text-blue-900 font-semibold shadow-sm" : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
                        }`}
                      >
                        <div className="text-xs">Dual Comparison (Both)</div>
                        <div className="text-[10px] text-slate-500 mt-0.5">Good Budget vs Entry-Level diff</div>
                      </div>
                      <div
                        onClick={() => setSelectedTier("GOOD_BUDGET")}
                        className={`p-3.5 rounded-lg border cursor-pointer transition ${
                          selectedTier === "GOOD_BUDGET" ? "bg-blue-50 border-blue-600 text-blue-900 font-semibold shadow-sm" : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
                        }`}
                      >
                        <div className="text-xs">Good Budget Only</div>
                        <div className="text-[10px] text-slate-500 mt-0.5">4x CPU, Fast 3G network</div>
                      </div>
                      <div
                        onClick={() => setSelectedTier("ENTRY_LEVEL")}
                        className={`p-3.5 rounded-lg border cursor-pointer transition ${
                          selectedTier === "ENTRY_LEVEL" ? "bg-blue-50 border-blue-600 text-blue-900 font-semibold shadow-sm" : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
                        }`}
                      >
                        <div className="text-xs">Entry-Level Only</div>
                        <div className="text-[10px] text-slate-500 mt-0.5">8x CPU, Slow 3G network</div>
                      </div>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isRunningTest}
                    className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium text-xs rounded-lg transition flex items-center gap-2 shadow-sm"
                  >
                    {isRunningTest ? <RotateCcw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5 fill-white" />}
                    {isRunningTest ? "Executing Background Test..." : "Execute Web Test"}
                  </button>
                </form>

                {/* Real-time Background Job Progress Card */}
                {activeJob && (
                  <div className="mt-6 p-4 rounded-xl bg-slate-50 border border-blue-200">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-blue-600 animate-ping" />
                        <span className="text-xs font-bold text-slate-900 font-mono">Job ID: {activeJob.job_id}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded font-mono uppercase ${
                          activeJob.status === "COMPLETED" ? "bg-emerald-100 text-emerald-800 border border-emerald-300" :
                          activeJob.status === "COMPLETED_WITH_WARNINGS" ? "bg-amber-100 text-amber-800 border border-amber-300" :
                          activeJob.status === "FAILED" ? "bg-red-100 text-red-800 border border-red-300" :
                          activeJob.status === "RUNNING" ? "bg-blue-100 text-blue-800 border border-blue-300" :
                          "bg-slate-100 text-slate-800"
                        }`}>
                          {activeJob.status.replace(/_/g, " ")}
                        </span>
                        {activeJob.error_category && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded font-mono uppercase bg-purple-100 text-purple-800 border border-purple-200">
                            {activeJob.error_category}
                          </span>
                        )}
                        <button
                          onClick={handleCancelJob}
                          disabled={isCancelling}
                          className="text-[10px] text-red-600 hover:text-red-800 disabled:opacity-50 font-semibold underline ml-1"
                        >
                          {isCancelling ? "Cancelling..." : "Cancel Job"}
                        </button>
                      </div>
                    </div>
                    <div className="space-y-1.5 text-xs text-slate-700">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-500">Pipeline Stage:</span>
                        <span className="font-medium text-blue-700">{activeJob.stage}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-500">Status Detail:</span>
                        <span className="text-slate-600">{activeJob.progress_message}</span>
                      </div>
                      {activeJob.error && (
                        <div className="flex items-start gap-2 pt-1 text-[11px] text-rose-700 bg-rose-50 p-2 rounded border border-rose-200">
                          <span className="font-semibold">Diagnostic:</span>
                          <span>{activeJob.error}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* COMPREHENSIVE TEST RESULTS & ANALYSIS VIEW */}
                {(comparisonData || testResult?.single_run_data || testResult?.metrics_summary) && (
                  <div className="mt-8 space-y-6 pt-6 border-t border-slate-200">
                    {/* Results Header */}
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 rounded-xl bg-slate-900 text-white shadow-sm">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded font-mono uppercase ${
                            (testResult?.status === "COMPLETED" || comparisonData) ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40" :
                            testResult?.status === "PARTIAL" ? "bg-amber-500/20 text-amber-300 border border-amber-500/40" :
                            "bg-blue-500/20 text-blue-300 border border-blue-500/40"
                          }`}>
                            {testResult?.status?.replace(/_/g, " ") || "COMPLETED"}
                          </span>
                          <span className="text-xs text-slate-400 font-mono">
                            Mode: {testResult?.mode || (comparisonData ? "DUAL_COMPARISON" : "SINGLE_RUN")}
                          </span>
                        </div>
                        <h3 className="text-base font-bold text-white mt-1">
                          Test Results for: <span className="text-blue-400 font-mono">{testResult?.target_url || testUrl}</span>
                        </h3>
                        {testResult?.final_url && testResult.final_url !== testResult.target_url && (
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            Final URL after redirects: <span className="font-mono text-slate-300">{testResult.final_url}</span>
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-4 text-xs font-mono text-slate-300">
                        {testResult?.duration_ms && (
                          <div>
                            <span className="text-[10px] text-slate-500 block uppercase">Duration</span>
                            <span className="font-bold text-white">{(testResult.duration_ms / 1000).toFixed(1)}s</span>
                          </div>
                        )}
                        <div>
                          <span className="text-[10px] text-slate-500 block uppercase">Completed</span>
                          <span className="text-slate-300 text-[11px]">
                            {testResult?.completed_at ? new Date(testResult.completed_at).toLocaleTimeString() : "Just now"}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* DUAL COMPARISON RESULTS */}
                    {comparisonData && (
                      <div className="space-y-6">
                        {/* 1. Comparison Bar Chart Visualizer */}
                        <div className="p-6 bg-white border border-slate-200 rounded-xl shadow-sm">
                          <div className="flex items-center justify-between mb-4">
                            <div>
                              <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                                <GitCompare className="w-4 h-4 text-blue-600" />
                                Hardware Degradation Differential (Core Web Vitals)
                              </h4>
                              <p className="text-[11px] text-slate-500 mt-0.5">
                                Compares real browser execution between Good Budget (4x CPU, Fast 3G) and Entry-Level (8x CPU, Slow 3G).
                              </p>
                            </div>
                            <span className="text-[10px] font-mono text-slate-500 bg-slate-50 px-2 py-1 rounded border">
                              Paired Profiling
                            </span>
                          </div>

                          <div className="h-64 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={comparisonChartData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                                <XAxis dataKey="name" stroke="#64748B" fontSize={11} />
                                <YAxis stroke="#64748B" fontSize={11} />
                                <Tooltip
                                  contentStyle={{ backgroundColor: "#FFFFFF", borderColor: "#E2E8F0", fontSize: "11px", borderRadius: "8px", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }}
                                />
                                <Bar dataKey="Good Budget" fill="#2563EB" radius={[4, 4, 0, 0]} />
                                <Bar dataKey="Entry-Level" fill="#0284C7" radius={[4, 4, 0, 0]} />
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        </div>

                        {/* 2. Side-by-Side Comparison Table */}
                        <div className="p-6 bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                          <h4 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
                            <Sliders className="w-4 h-4 text-blue-600" /> Side-by-Side Metric Metrics & Delta
                          </h4>
                          <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs">
                              <thead>
                                <tr className="border-b border-slate-200 text-slate-500 font-semibold bg-slate-50/50">
                                  <th className="py-2.5 px-3">Metric</th>
                                  <th className="py-2.5 px-3 text-blue-700">Good Budget Profile</th>
                                  <th className="py-2.5 px-3 text-sky-700">Entry-Level Profile</th>
                                  <th className="py-2.5 px-3">Degradation / Delta</th>
                                  <th className="py-2.5 px-3">Assessment</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 font-mono">
                                {Object.entries(comparisonData.metrics_diff || {}).map(([key, val]: [string, any]) => {
                                  const isRegressed = val.pct_change !== null && val.pct_change >= 25;
                                  return (
                                    <tr key={key} className={isRegressed ? "bg-red-50/40" : "hover:bg-slate-50/50"}>
                                      <td className="py-3 px-3 font-bold text-slate-900">{key}</td>
                                      <td className="py-3 px-3 text-slate-700 font-semibold">
                                        {val.good_budget !== null ? `${val.good_budget} ${val.unit}` : "N/A"}
                                      </td>
                                      <td className="py-3 px-3 text-slate-700 font-semibold">
                                        {val.entry_level !== null ? `${val.entry_level} ${val.unit}` : "N/A"}
                                      </td>
                                      <td className="py-3 px-3">
                                        {val.pct_change !== null ? (
                                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                            isRegressed ? "bg-red-100 text-red-700 border border-red-200" : "bg-emerald-100 text-emerald-700"
                                          }`}>
                                            +{val.pct_change}% (+{val.delta} {val.unit})
                                          </span>
                                        ) : (
                                          <span className="text-slate-400 text-[10px]">Incomplete</span>
                                        )}
                                      </td>
                                      <td className="py-3 px-3 text-[11px]">
                                        {isRegressed ? (
                                          <span className="text-red-700 font-sans font-semibold flex items-center gap-1">
                                            <TrendingDown className="w-3.5 h-3.5" /> Severe Degradation
                                          </span>
                                        ) : (
                                          <span className="text-emerald-700 font-sans font-semibold flex items-center gap-1">
                                            <Check className="w-3.5 h-3.5" /> Acceptable
                                          </span>
                                        )}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>

                        {/* 3. Paired Profile Detail Cards (Good Budget & Entry-Level) */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          {/* Good Budget Card */}
                          <div className="p-5 bg-white border border-blue-200 rounded-xl shadow-sm space-y-3">
                            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                              <div>
                                <h4 className="text-xs font-bold text-blue-900 flex items-center gap-1.5">
                                  <Smartphone className="w-4 h-4 text-blue-600" /> Good Budget Tier Results
                                </h4>
                                <span className="text-[10px] text-slate-500 font-mono">4x CPU Throttling • Fast 3G • 4GB RAM</span>
                              </div>
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                                {comparisonData.good_budget_run?.status || "COMPLETED"}
                              </span>
                            </div>

                            <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                              {(comparisonData.good_budget_run?.metrics || []).map((m: any) => (
                                <div key={m.name} className="p-2.5 bg-slate-50 rounded border border-slate-100">
                                  <div className="text-[10px] text-slate-500 truncate">{m.name}</div>
                                  <div className="font-bold text-slate-900 mt-0.5">
                                    {m.value} <span className="text-[10px] text-slate-500 font-normal">{m.unit}</span>
                                  </div>
                                  <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded mt-1 inline-block ${
                                    m.rating === "GOOD" ? "bg-emerald-100 text-emerald-800" :
                                    m.rating === "NEEDS_IMPROVEMENT" ? "bg-amber-100 text-amber-800" :
                                    m.rating === "POOR" ? "bg-red-100 text-red-800" :
                                    "bg-slate-100 text-slate-600"
                                  }`}>
                                    {m.rating}
                                  </span>
                                </div>
                              ))}
                            </div>

                            <div className="pt-2 border-t border-slate-100 text-[11px] text-slate-600 space-y-1">
                              <div className="flex justify-between">
                                <span>Duration:</span>
                                <span className="font-mono font-semibold">{comparisonData.good_budget_run?.duration_ms}ms</span>
                              </div>
                              <div className="flex justify-between">
                                <span>Issues Detected:</span>
                                <span className="font-mono font-semibold">{comparisonData.good_budget_run?.failure_count || 0}</span>
                              </div>
                            </div>
                          </div>

                          {/* Entry-Level Card */}
                          <div className="p-5 bg-white border border-sky-200 rounded-xl shadow-sm space-y-3">
                            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                              <div>
                                <h4 className="text-xs font-bold text-sky-900 flex items-center gap-1.5">
                                  <Smartphone className="w-4 h-4 text-sky-600" /> Entry-Level Tier Results
                                </h4>
                                <span className="text-[10px] text-slate-500 font-mono">8x CPU Throttling • Slow 3G • 2GB RAM</span>
                              </div>
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-sky-50 text-sky-700 border border-sky-200">
                                {comparisonData.entry_level_run?.status || "COMPLETED"}
                              </span>
                            </div>

                            <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                              {(comparisonData.entry_level_run?.metrics || []).map((m: any) => (
                                <div key={m.name} className="p-2.5 bg-slate-50 rounded border border-slate-100">
                                  <div className="text-[10px] text-slate-500 truncate">{m.name}</div>
                                  <div className="font-bold text-slate-900 mt-0.5">
                                    {m.value} <span className="text-[10px] text-slate-500 font-normal">{m.unit}</span>
                                  </div>
                                  <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded mt-1 inline-block ${
                                    m.rating === "GOOD" ? "bg-emerald-100 text-emerald-800" :
                                    m.rating === "NEEDS_IMPROVEMENT" ? "bg-amber-100 text-amber-800" :
                                    m.rating === "POOR" ? "bg-red-100 text-red-800" :
                                    "bg-slate-100 text-slate-600"
                                  }`}>
                                    {m.rating}
                                  </span>
                                </div>
                              ))}
                            </div>

                            <div className="pt-2 border-t border-slate-100 text-[11px] text-slate-600 space-y-1">
                              <div className="flex justify-between">
                                <span>Duration:</span>
                                <span className="font-mono font-semibold">{comparisonData.entry_level_run?.duration_ms}ms</span>
                              </div>
                              <div className="flex justify-between">
                                <span>Issues Detected:</span>
                                <span className="font-mono font-semibold">{comparisonData.entry_level_run?.failure_count || 0}</span>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* 4. Artifacts & Screenshots Preview */}
                        {((comparisonData.good_budget_run?.artifacts?.length || 0) > 0 || (comparisonData.entry_level_run?.artifacts?.length || 0) > 0) && (
                          <div className="p-5 bg-white border border-slate-200 rounded-xl shadow-sm">
                            <h4 className="text-xs font-bold text-slate-900 mb-3 flex items-center gap-2">
                              <FileText className="w-4 h-4 text-blue-600" /> Screenshots & Recorded Execution Artifacts
                            </h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                              {[...(comparisonData.good_budget_run?.artifacts || []), ...(comparisonData.entry_level_run?.artifacts || [])].map((art: any, idx: number) => (
                                <div key={idx} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200">
                                  <div className="flex items-center gap-2.5">
                                    <FileCode className="w-4 h-4 text-slate-500" />
                                    <div>
                                      <div className="font-bold text-slate-800">{art.artifact_type}</div>
                                      <div className="text-[10px] text-slate-500 font-mono truncate max-w-xs">{art.file_path}</div>
                                    </div>
                                  </div>
                                  <span className="text-[10px] font-mono text-slate-400">
                                    {(art.file_size_bytes / 1024).toFixed(1)} KB
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* 5. Root Cause Analysis & Recommendations */}
                        {(recommendations.length > 0 || (comparisonData.recommendations?.length || 0) > 0) && (
                          <div className="p-5 bg-white border border-slate-200 rounded-xl shadow-sm space-y-4">
                            <div className="flex items-center justify-between">
                              <h4 className="text-xs font-bold text-slate-900 flex items-center gap-2">
                                <Brain className="w-4 h-4 text-pink-600" /> AI & Rule-Engine Root Cause Analysis
                              </h4>
                              <span className="text-[10px] text-slate-500 font-mono">
                                {(recommendations.length || comparisonData.recommendations?.length)} Actionable Recommendations
                              </span>
                            </div>

                            <div className="space-y-3">
                              {(recommendations.length > 0 ? recommendations : comparisonData.recommendations || []).map((r: any) => (
                                <div key={r.id || r.title} className="p-4 rounded-lg border border-slate-200 bg-slate-50/50 space-y-2">
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                      <span className={`text-[9px] font-bold px-2 py-0.5 rounded font-mono uppercase ${
                                        r.impact === "CRITICAL" ? "bg-red-100 text-red-800" :
                                        r.impact === "HIGH" ? "bg-amber-100 text-amber-800" :
                                        "bg-blue-100 text-blue-800"
                                      }`}>
                                        {r.impact} IMPACT
                                      </span>
                                      <span className="text-xs font-bold text-slate-900">{r.title}</span>
                                    </div>
                                    <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-white border text-slate-700">
                                      {r.status || "OPEN"}
                                    </span>
                                  </div>

                                  <div className="text-xs text-slate-600">
                                    <span className="font-semibold text-slate-700">Probable Cause: </span>
                                    {r.probable_cause}
                                  </div>

                                  <div className="text-xs text-slate-700 bg-white p-2.5 rounded border border-slate-200/80">
                                    <span className="font-semibold text-blue-700">Remediation: </span>
                                    {r.remediation}
                                  </div>

                                  {r.verification_steps && (
                                    <div className="text-[11px] text-slate-500">
                                      <span className="font-semibold text-slate-600">Verification: </span>
                                      {r.verification_steps}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* SINGLE RUN RESULTS (When Single Profile was selected) */}
                    {!comparisonData && (testResult?.single_run_data || testResult?.metrics_summary) && (
                      <div className="p-6 bg-white border border-slate-200 rounded-xl shadow-sm space-y-4">
                        <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                          <Smartphone className="w-4 h-4 text-blue-600" />
                          Single Profile Execution Metrics ({testResult?.tier || selectedTier})
                        </h4>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 font-mono">
                          {((testResult?.single_run_data?.metrics) || []).map((m: any) => (
                            <div key={m.name} className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                              <div className="text-[10px] text-slate-500 uppercase">{m.name}</div>
                              <div className="text-base font-bold text-slate-900 mt-0.5">
                                {m.value} <span className="text-xs font-normal text-slate-500">{m.unit}</span>
                              </div>
                              <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded mt-1.5 inline-block ${
                                m.rating === "GOOD" ? "bg-emerald-100 text-emerald-800" :
                                m.rating === "NEEDS_IMPROVEMENT" ? "bg-amber-100 text-amber-800" :
                                m.rating === "POOR" ? "bg-red-100 text-red-800" : "bg-slate-100 text-slate-600"
                              }`}>
                                {m.rating}
                              </span>
                            </div>
                          ))}
                        </div>

                        {/* Single run recommendations */}
                        {(recommendations.length > 0 || (testResult?.single_run_data?.recommendations?.length || 0) > 0) && (
                          <div className="pt-4 border-t border-slate-100 space-y-3">
                            <h5 className="text-xs font-bold text-slate-800">Root Cause Analysis & Remediation</h5>
                            {(recommendations.length > 0 ? recommendations : testResult?.single_run_data?.recommendations || []).map((r: any) => (
                              <div key={r.id || r.title} className="p-3 rounded-lg border border-slate-200 bg-slate-50/50 space-y-1.5 text-xs">
                                <div className="flex items-center gap-2">
                                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 font-mono">
                                    {r.impact}
                                  </span>
                                  <span className="font-bold text-slate-900">{r.title}</span>
                                </div>
                                <p className="text-slate-600">{r.probable_cause}</p>
                                <p className="text-blue-700 bg-white p-2 rounded border border-slate-200 font-sans">
                                  <strong>Remediation: </strong>{r.remediation}
                                </p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: ANDROID APK TESTING */}
          {activeTab === "android_test" && (
            <div className="space-y-6">
              <div className="p-6 rounded-xl bg-white border border-slate-200 shadow-sm">
                <h2 className="text-base font-bold text-slate-900 mb-1">Engine B: Android APK Performance Testing</h2>
                <p className="text-xs text-slate-500 mb-6">
                  Upload an Android APK to inspect its manifest, permissions, and run launch, logcat, crash, and ANR profiling via host ADB.
                </p>

                {/* ADB Diagnostic Banner */}
                <div className={`p-4 rounded-xl border mb-6 ${
                  deviceLabStatus?.adb?.available ? "bg-emerald-50 border-emerald-200" : "bg-amber-50 border-amber-200"
                }`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Smartphone className={`w-5 h-5 ${deviceLabStatus?.adb?.available ? "text-emerald-700" : "text-amber-700"}`} />
                      <div>
                        <div className="text-xs font-bold text-slate-900">
                          Host ADB Status: {deviceLabStatus?.adb?.status || "SETUP_REQUIRED"}
                        </div>
                        <div className="text-[11px] text-slate-600 mt-0.5">
                          {deviceLabStatus?.adb?.available
                            ? `Version: ${deviceLabStatus?.adb?.version}`
                            : "Android SDK / ADB was not detected in system PATH. Install Android Studio or add platform-tools to PATH."}
                        </div>
                      </div>
                    </div>
                    <span className="px-2.5 py-1 rounded text-[10px] font-mono font-semibold bg-white border border-slate-200 text-slate-700 shadow-sm">
                      Devices Connected: {deviceLabStatus?.device_count || 0}
                    </span>
                  </div>
                </div>

                {/* Upload Box */}
                <div className="border-2 border-dashed border-slate-200 hover:border-blue-400 rounded-xl p-8 text-center bg-slate-50 transition">
                  <Upload className="w-8 h-8 text-blue-600 mx-auto mb-3" />
                  <h4 className="text-xs font-bold text-slate-800 mb-1">Drop Android APK here or click to browse</h4>
                  <p className="text-[11px] text-slate-500 mb-4">Supported file format: .apk (Maximum size: 150 MB)</p>
                  <input
                    type="file"
                    accept=".apk"
                    onChange={handleApkUpload}
                    className="hidden"
                    id="apk-upload-input"
                  />
                  <label
                    htmlFor="apk-upload-input"
                    className="cursor-pointer px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-medium border border-slate-200 shadow-sm inline-block"
                  >
                    {isUploadingApk ? "Validating APK Archive..." : "Select APK File"}
                  </label>
                </div>

                {/* APK Manifest Details */}
                {apkManifest && (
                  <div className="mt-6 p-5 rounded-xl bg-slate-50 border border-slate-200 font-mono text-xs space-y-3">
                    <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                      <span className="text-blue-700 font-bold">APK Validation & Manifest Extraction</span>
                      <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded font-sans font-semibold">VALID ARCHIVE</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <div><span className="text-slate-500">Package Name:</span> <span className="text-slate-900 font-semibold">{apkManifest.package_name}</span></div>
                      <div><span className="text-slate-500">Version:</span> <span className="text-slate-900 font-semibold">{apkManifest.version_name} (Code: {apkManifest.version_code})</span></div>
                      <div><span className="text-slate-500">File Size:</span> <span className="text-slate-900 font-semibold">{apkManifest.file_size_mb} MB</span></div>
                      <div><span className="text-slate-500">SHA256:</span> <span className="text-slate-900 truncate block">{apkManifest.sha256}</span></div>
                    </div>
                    <div>
                      <span className="text-slate-500 text-[10px]">Requested Permissions ({apkManifest.permissions?.length || 0}):</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {apkManifest.permissions?.map((p: string) => (
                          <span key={p} className="px-1.5 py-0.5 bg-white border border-slate-200 rounded text-[10px] text-slate-700 shadow-xs">
                            {p}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 4: DEVICE COMPARISON */}
          {activeTab === "compare" && (
            <div className="space-y-6">
              <div className="p-6 rounded-xl bg-white border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                      <GitCompare className="w-5 h-5 text-blue-600" />
                      Side-by-Side Device Comparison & Degradation
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Differential analysis between Good Budget and Entry-Level performance profiles.
                    </p>
                  </div>
                  {comparisonData?.comparison_group_id && (
                    <span className="text-[10px] font-mono text-slate-500 bg-slate-50 px-2.5 py-1 rounded border border-slate-200">
                      Group ID: {comparisonData.comparison_group_id.slice(0, 8)}...
                    </span>
                  )}
                </div>

                {!comparisonData ? (
                  <div className="p-12 text-center text-slate-400 text-xs">
                    No comparison test loaded yet. Go to <button onClick={() => setActiveTab("web_test")} className="text-blue-600 underline font-semibold">Website Testing</button> and run a Dual Test to see side-by-side results.
                  </div>
                ) : (
                  <div className="space-y-6">
                    {/* Visual Comparison Chart */}
                    <div className="p-5 bg-slate-50 border border-slate-200 rounded-xl">
                      <h4 className="text-xs font-bold text-slate-700 mb-4">Core Web Vitals Metric Differential</h4>
                      <div className="h-64 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={comparisonChartData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                            <XAxis dataKey="name" stroke="#64748B" fontSize={11} />
                            <YAxis stroke="#64748B" fontSize={11} />
                            <Tooltip
                              contentStyle={{ backgroundColor: "#FFFFFF", borderColor: "#E2E8F0", fontSize: "11px", borderRadius: "8px", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }}
                            />
                            <Bar dataKey="Good Budget" fill="#2563EB" radius={[4, 4, 0, 0]} />
                            <Bar dataKey="Entry-Level" fill="#0284C7" radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    {/* Side-by-Side Profile Table */}
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-slate-200 text-slate-500 font-semibold">
                            <th className="py-2.5 px-3">Metric</th>
                            <th className="py-2.5 px-3 text-blue-700">Good Budget Profile</th>
                            <th className="py-2.5 px-3 text-sky-700">Entry-Level Profile</th>
                            <th className="py-2.5 px-3">Degradation / Delta</th>
                            <th className="py-2.5 px-3">Rating</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-mono">
                          {Object.entries(comparisonData.metrics_diff || {}).map(([key, val]: [string, any]) => {
                            const isRegressed = val.pct_change >= 25;
                            return (
                              <tr key={key} className={isRegressed ? "bg-red-50/40" : "hover:bg-slate-50/50"}>
                                <td className="py-3 px-3 font-bold text-slate-900">{key}</td>
                                <td className="py-3 px-3 text-slate-700">{val.good_budget} {val.unit}</td>
                                <td className="py-3 px-3 text-slate-700">{val.entry_level} {val.unit}</td>
                                <td className="py-3 px-3">
                                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                    isRegressed ? "bg-red-100 text-red-700 border border-red-200" : "bg-emerald-100 text-emerald-700"
                                  }`}>
                                    +{val.pct_change}% (+{val.delta} {val.unit})
                                  </span>
                                </td>
                                <td className="py-3 px-3 text-[11px]">
                                  {isRegressed ? (
                                    <span className="text-red-700 font-sans font-semibold flex items-center gap-1">
                                      <TrendingDown className="w-3.5 h-3.5" /> Severe Degradation
                                    </span>
                                  ) : (
                                    <span className="text-emerald-700 font-sans font-semibold flex items-center gap-1">
                                      <Check className="w-3.5 h-3.5" /> Acceptable
                                    </span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 5: FAILURE EXPLORER */}
          {activeTab === "failures" && (
            <div className="space-y-6">
              <div className="p-6 rounded-xl bg-white border border-slate-200 shadow-sm">
                <h2 className="text-base font-bold text-slate-900 mb-1">Failure Explorer & Error Signatures</h2>
                <p className="text-xs text-slate-500 mb-6">
                  Deduplicated runtime exceptions, JavaScript errors, and network HTTP failures captured during real browser sessions.
                </p>

                {(!comparisonData?.entry_level_run?.failures || comparisonData.entry_level_run.failures.length === 0) ? (
                  <div className="p-8 text-center text-slate-400 text-xs bg-slate-50 rounded-xl border border-slate-200">
                    Zero fatal exceptions detected in active run session.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {comparisonData.entry_level_run.failures.map((fail: any) => {
                      const getCategoryBadge = (type: string) => {
                        switch (type) {
                          case "TARGET_APPLICATION_ERROR":
                          case "JS_ERROR":
                            return "bg-purple-100 text-purple-700 border-purple-200";
                          case "NETWORK_ERROR":
                            return "bg-rose-100 text-rose-700 border-rose-200";
                          case "HTTP_ERROR":
                          case "HTTP_FAILURE":
                            return "bg-blue-100 text-blue-700 border-blue-200";
                          case "BROWSER_INFRASTRUCTURE_ERROR":
                            return "bg-slate-200 text-slate-800 border-slate-300";
                          case "ACCESS_RESTRICTION":
                            return "bg-orange-100 text-orange-800 border-orange-200";
                          case "NAVIGATION_TIMEOUT":
                          case "PERFORMANCE_REGRESSION":
                            return "bg-amber-100 text-amber-800 border-amber-200";
                          case "SSL_ERROR":
                            return "bg-yellow-100 text-yellow-800 border-yellow-200";
                          default:
                            return "bg-red-100 text-red-700 border-red-200";
                        }
                      };

                      return (
                        <div key={fail.id} className="p-4 rounded-xl bg-slate-50 border border-slate-200 font-mono text-xs">
                          <div className="flex items-center justify-between mb-2">
                            <span className={`px-2.5 py-0.5 rounded text-[10px] font-bold border ${getCategoryBadge(fail.failure_type)}`}>
                              {fail.failure_type}
                            </span>
                            <span className="text-[10px] text-slate-500">
                              Sig: {fail.error_signature}
                            </span>
                          </div>
                          <h4 className="font-bold text-slate-900 text-sm mb-1">{fail.title}</h4>
                          <p className="text-slate-600 text-[11px] mb-2">{fail.message}</p>
                          {fail.url_or_file && (
                            <div className="text-[10px] text-blue-700 truncate">
                              Source: {fail.url_or_file}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 6: ROOT CAUSE ANALYSIS & OPTIMIZATIONS */}
          {(activeTab === "rca" || activeTab === "optimizations") && (
            <div className="space-y-6">
              <div className="p-6 rounded-xl bg-white border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                      <Brain className="w-5 h-5 text-pink-600" />
                      Evidence-Grounded Root Cause & Fix Workflow
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Developer Workflow: Finding → Investigate → Apply Fix → Rerun → Verify
                    </p>
                  </div>
                </div>

                {recommendations.length === 0 ? (
                  <div className="p-8 text-center text-slate-400 text-xs bg-slate-50 rounded-xl border border-slate-200">
                    No active recommendations generated. Run a test to analyze bottlenecks.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {recommendations.map((rec: any) => (
                      <div key={rec.id} className="p-5 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-pink-100 text-pink-700 border border-pink-200">
                              {rec.category || "Performance"}
                            </span>
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-200">
                              Impact: {rec.impact || "HIGH"}
                            </span>
                          </div>
                          <span className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded ${
                            rec.status === "VERIFIED" ? "bg-emerald-100 text-emerald-700 border border-emerald-200" :
                            rec.status === "APPLIED" ? "bg-blue-100 text-blue-700 border border-blue-200" : "bg-slate-200 text-slate-700"
                          }`}>
                            Status: {rec.status}
                          </span>
                        </div>

                        <h3 className="text-sm font-bold text-slate-900">{rec.title}</h3>

                        {/* Probable Cause */}
                        <div className="p-3.5 bg-white rounded-lg border border-slate-200 text-xs shadow-xs">
                          <div className="text-slate-600 font-semibold mb-1">Probable Root Cause:</div>
                          <p className="text-slate-800 leading-relaxed">{rec.probable_cause}</p>
                        </div>

                        {/* Remediation */}
                        <div className="p-3.5 bg-white rounded-lg border border-slate-200 text-xs font-mono shadow-xs">
                          <div className="text-blue-700 font-semibold mb-1">Recommended Remediation:</div>
                          <p className="text-slate-700 whitespace-pre-line leading-relaxed">{rec.remediation}</p>
                        </div>

                        {/* Verification */}
                        <div className="p-3.5 bg-white rounded-lg border border-slate-200 text-xs font-mono shadow-xs">
                          <div className="text-emerald-700 font-semibold mb-1">Verification Steps:</div>
                          <p className="text-slate-700 whitespace-pre-line leading-relaxed">{rec.verification_steps}</p>
                        </div>

                        {/* Workflow Actions */}
                        <div className="flex items-center gap-3 pt-1">
                          <button
                            onClick={() => handleStatusUpdate(rec.id, "APPLIED")}
                            className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs transition shadow-sm"
                          >
                            Mark Fix Applied
                          </button>
                          <button
                            onClick={() => handleStatusUpdate(rec.id, "VERIFIED")}
                            className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs transition shadow-sm"
                          >
                            Mark Verified
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 7: NEO4J INTELLIGENCE GRAPH */}
          {activeTab === "graph" && (
            <div className="space-y-6">
              <div className="p-6 rounded-xl bg-white border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                      <Database className="w-5 h-5 text-amber-600" />
                      Neo4j Knowledge Graph Intelligence
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Visualizing relationships between Applications, Runs, Profiles, Metrics, Failures, and Error Signatures.
                    </p>
                  </div>
                  <button
                    onClick={refreshHealth}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-xs font-medium rounded-lg text-slate-700 transition"
                  >
                    <RotateCcw className="w-3.5 h-3.5" /> Check Status
                  </button>
                </div>

                <IntelligenceGraph data={graphData} onRefresh={refreshHealth} />
              </div>
            </div>
          )}

          {/* TAB 8: DEVICE LAB */}
          {activeTab === "device_lab" && (
            <div className="space-y-6">
              <div className="p-6 rounded-xl bg-white border border-slate-200 shadow-sm">
                <h2 className="text-base font-bold text-slate-900 mb-1">Device Lab & Testing Profile Specifications</h2>
                <p className="text-xs text-slate-500 mb-6">
                  Hardware and network constraints emulated during test sessions.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Good Budget */}
                  <div className="p-5 rounded-xl bg-slate-50 border border-blue-200 space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sm text-blue-700">Good Budget Tier</span>
                      <span className="text-[10px] font-mono bg-blue-100 text-blue-800 border border-blue-200 px-2 py-0.5 rounded font-semibold">~$150-$200 Bracket</span>
                    </div>
                    <p className="text-xs text-slate-600">Representative of Samsung Galaxy A14 / Moto G series.</p>
                    <div className="space-y-2 text-xs font-mono">
                      <div className="flex justify-between border-b border-slate-200 py-1.5">
                        <span className="text-slate-500">CPU Throttling:</span>
                        <span className="text-slate-900 font-semibold">4x Slowdown</span>
                      </div>
                      <div className="flex justify-between border-b border-slate-200 py-1.5">
                        <span className="text-slate-500">Network Simulation:</span>
                        <span className="text-slate-900 font-semibold">Fast 3G (1.6 Mbps / 40ms)</span>
                      </div>
                      <div className="flex justify-between border-b border-slate-200 py-1.5">
                        <span className="text-slate-500">Viewport:</span>
                        <span className="text-slate-900 font-semibold">390 x 844 (Scale 2.5)</span>
                      </div>
                      <div className="flex justify-between py-1.5">
                        <span className="text-slate-500">RAM:</span>
                        <span className="text-slate-900 font-semibold">4,096 MB</span>
                      </div>
                    </div>
                  </div>

                  {/* Entry-Level */}
                  <div className="p-5 rounded-xl bg-slate-50 border border-sky-200 space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sm text-sky-700">Entry-Level Tier</span>
                      <span className="text-[10px] font-mono bg-sky-100 text-sky-800 border border-sky-200 px-2 py-0.5 rounded font-semibold">~$70-$100 Bracket</span>
                    </div>
                    <p className="text-xs text-slate-600">Representative of Redmi 9A / Nokia C-series.</p>
                    <div className="space-y-2 text-xs font-mono">
                      <div className="flex justify-between border-b border-slate-200 py-1.5">
                        <span className="text-slate-500">CPU Throttling:</span>
                        <span className="text-slate-900 font-semibold">8x Slowdown</span>
                      </div>
                      <div className="flex justify-between border-b border-slate-200 py-1.5">
                        <span className="text-slate-500">Network Simulation:</span>
                        <span className="text-slate-900 font-semibold">Slow 3G (500 kbps / 200ms)</span>
                      </div>
                      <div className="flex justify-between border-b border-slate-200 py-1.5">
                        <span className="text-slate-500">Viewport:</span>
                        <span className="text-slate-900 font-semibold">360 x 800 (Scale 2.0)</span>
                      </div>
                      <div className="flex justify-between py-1.5">
                        <span className="text-slate-500">RAM:</span>
                        <span className="text-slate-900 font-semibold">2,048 MB</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 9: DOCUMENTATION & RUNBOOKS */}
          {activeTab === "docs" && (
            <div className="space-y-6">
              <div className="p-6 rounded-xl bg-white border border-slate-200 shadow-sm space-y-4">
                <h2 className="text-base font-bold text-slate-900">TierLens Platform Documentation & Architecture</h2>
                <p className="text-xs text-slate-600 leading-relaxed">
                  TierLens is a full-stack Application Performance & Device Intelligence platform written in Python (FastAPI, SQLAlchemy, Playwright) and TypeScript (Next.js 14, Tailwind CSS, Recharts).
                </p>

                <div className="space-y-3 font-mono text-xs text-slate-700">
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <span className="text-blue-700 font-bold">1. Starting Backend Services</span>
                    <pre className="text-[11px] text-slate-600 mt-1">$ docker compose up -d postgres neo4j redis</pre>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <span className="text-blue-700 font-bold">2. Running Local FastAPI Server</span>
                    <pre className="text-[11px] text-slate-600 mt-1">$ backend\.venv\Scripts\uvicorn.exe app.main:app --reload --port 8000</pre>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <span className="text-blue-700 font-bold">3. Running Next.js Frontend</span>
                    <pre className="text-[11px] text-slate-600 mt-1">$ cd frontend && npm run dev</pre>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 10: SETTINGS */}
          {activeTab === "settings" && (
            <div className="space-y-6">
              <div className="p-6 rounded-xl bg-white border border-slate-200 shadow-sm space-y-4">
                <h2 className="text-base font-bold text-slate-900">Platform Settings & Service Endpoints</h2>
                <div className="space-y-3 text-xs font-mono">
                  <div>
                    <label className="text-slate-600 block mb-1 font-semibold">FastAPI Backend URL</label>
                    <input
                      type="text"
                      readOnly
                      value="http://localhost:8000"
                      className="w-full bg-slate-50 border border-slate-200 rounded p-2 text-slate-800"
                    />
                  </div>
                  <div>
                    <label className="text-slate-600 block mb-1 font-semibold">Neo4j Bolt URI</label>
                    <input
                      type="text"
                      readOnly
                      value="bolt://localhost:7687"
                      className="w-full bg-slate-50 border border-slate-200 rounded p-2 text-slate-800"
                    />
                  </div>
                  <div>
                    <label className="text-slate-600 block mb-1 font-semibold">PostgreSQL URI</label>
                    <input
                      type="text"
                      readOnly
                      value="postgresql+asyncpg://tierlens:tierlens_secure_pass@localhost:5432/tierlens_db"
                      className="w-full bg-slate-50 border border-slate-200 rounded p-2 text-slate-800"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 11: AUDIT REPORTS */}
          {activeTab === "reports" && (
            <div className="space-y-6">
              <div className="p-6 rounded-xl bg-white border border-slate-200 shadow-sm">
                <h2 className="text-base font-bold text-slate-900 mb-2">Audit Reports & Quality Assurance Log</h2>
                <p className="text-xs text-slate-500 mb-6">
                  Certified audit log of all completed dual-device test sessions and verification records.
                </p>
                <div className="p-8 text-center text-slate-400 text-xs bg-slate-50 rounded-xl border border-slate-200">
                  Audit reports are updated in real-time as dual-device tests execute.
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
