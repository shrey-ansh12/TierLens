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
  Cell
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

  // Fetch Initial System Health
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
    refreshHealth();
  }, []);

  // Execute Web Test
  const handleExecuteWebTest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testUrl) return;

    setErrorBanner(null);
    setIsRunningTest(true);
    setTestStep("Validating SSRF & safety headers...");

    try {
      setTestStep("Launching Playwright Chromium engine with CDP throttling...");
      const res = await ApiClient.runWebTest({
        target_url: testUrl,
        tier: selectedTier,
      });

      setTestStep("Extracting Core Web Vitals, HAR, and console logs...");
      setTestResult(res);

      if (res.mode === "DUAL_COMPARISON") {
        setTestStep("Computing comparative degradation between Good Budget and Entry-Level...");
        const comp = await ApiClient.getComparison(res.comparison_group_id);
        setComparisonData(comp);

        // Fetch recommendations from entry-level run
        if (comp.entry_level_run?.id) {
          const recs = await ApiClient.getRunRecommendations(comp.entry_level_run.id);
          setRecommendations(recs);
        }

        // Fetch graph
        if (comp.entry_level_run?.project_id) {
          const g = await ApiClient.getProjectGraph(comp.entry_level_run.project_id);
          setGraphData(g);
        }

        setActiveTab("compare");
      } else {
        setTestStep("Completed single device analysis.");
        if (res.test_run_id) {
          const recs = await ApiClient.getRunRecommendations(res.test_run_id);
          setRecommendations(recs);
        }
        setActiveTab("failures");
      }
    } catch (err: any) {
      setErrorBanner(err.message || "Failed to execute test.");
    } finally {
      setIsRunningTest(false);
      setTestStep(null);
    }
  };

  // Upload APK
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

  // Mark recommendation status
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

  // Prepare chart data for comparison
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
    <div className="flex h-screen bg-[#080C14] text-slate-100 overflow-hidden font-sans">
      {/* Sidebar Navigation */}
      <aside className="w-64 bg-[#0D131F] border-r border-slate-800 flex flex-col justify-between shrink-0">
        <div>
          {/* Logo & Brand */}
          <div className="p-5 border-b border-slate-800/80 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center font-black text-black text-lg shadow-lg shadow-cyan-500/20">
              TL
            </div>
            <div>
              <h1 className="font-extrabold text-base tracking-tight text-white flex items-center gap-1.5">
                TierLens <span className="text-[10px] bg-cyan-950 text-cyan-400 border border-cyan-800/60 px-1.5 py-0.2 rounded font-mono">v1.0</span>
              </h1>
              <p className="text-[11px] text-slate-400 font-medium">Device Intelligence Platform</p>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="p-3 space-y-1 overflow-y-auto max-h-[calc(100vh-190px)]">
            <div className="text-[10px] font-bold text-slate-500 uppercase px-3 py-1 tracking-wider">
              Testing Engines
            </div>
            <button
              onClick={() => setActiveTab("overview")}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition ${
                activeTab === "overview" ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 font-semibold" : "text-slate-300 hover:bg-slate-800/60 hover:text-white"
              }`}
            >
              <Activity className="w-4 h-4 text-cyan-400" />
              Main Dashboard
            </button>
            <button
              onClick={() => setActiveTab("web_test")}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition ${
                activeTab === "web_test" ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 font-semibold" : "text-slate-300 hover:bg-slate-800/60 hover:text-white"
              }`}
            >
              <Globe className="w-4 h-4 text-blue-400" />
              Website Testing
            </button>
            <button
              onClick={() => setActiveTab("android_test")}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition ${
                activeTab === "android_test" ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 font-semibold" : "text-slate-300 hover:bg-slate-800/60 hover:text-white"
              }`}
            >
              <Smartphone className="w-4 h-4 text-emerald-400" />
              Android APK Testing
            </button>
            <button
              onClick={() => setActiveTab("device_lab")}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition ${
                activeTab === "device_lab" ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 font-semibold" : "text-slate-300 hover:bg-slate-800/60 hover:text-white"
              }`}
            >
              <Radio className="w-4 h-4 text-purple-400" />
              Device Lab & Hardware Tiers
            </button>

            <div className="text-[10px] font-bold text-slate-500 uppercase px-3 pt-4 pb-1 tracking-wider">
              Analysis & Intelligence
            </div>
            <button
              onClick={() => setActiveTab("compare")}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition ${
                activeTab === "compare" ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 font-semibold" : "text-slate-300 hover:bg-slate-800/60 hover:text-white"
              }`}
            >
              <GitCompare className="w-4 h-4 text-cyan-400" />
              Device Comparison (Side-by-Side)
            </button>
            <button
              onClick={() => setActiveTab("failures")}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition ${
                activeTab === "failures" ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 font-semibold" : "text-slate-300 hover:bg-slate-800/60 hover:text-white"
              }`}
            >
              <AlertOctagon className="w-4 h-4 text-red-400" />
              Failure Explorer
            </button>
            <button
              onClick={() => setActiveTab("rca")}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition ${
                activeTab === "rca" ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 font-semibold" : "text-slate-300 hover:bg-slate-800/60 hover:text-white"
              }`}
            >
              <Brain className="w-4 h-4 text-pink-400" />
              Root Cause Analysis
            </button>
            <button
              onClick={() => setActiveTab("graph")}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition ${
                activeTab === "graph" ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 font-semibold" : "text-slate-300 hover:bg-slate-800/60 hover:text-white"
              }`}
            >
              <Database className="w-4 h-4 text-amber-400" />
              Neo4j Intelligence Graph
            </button>
            <button
              onClick={() => setActiveTab("optimizations")}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition ${
                activeTab === "optimizations" ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 font-semibold" : "text-slate-300 hover:bg-slate-800/60 hover:text-white"
              }`}
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              Optimization & Fix Workflow
            </button>

            <div className="text-[10px] font-bold text-slate-500 uppercase px-3 pt-4 pb-1 tracking-wider">
              Governance & Docs
            </div>
            <button
              onClick={() => setActiveTab("reports")}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition ${
                activeTab === "reports" ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 font-semibold" : "text-slate-300 hover:bg-slate-800/60 hover:text-white"
              }`}
            >
              <FileText className="w-4 h-4 text-slate-400" />
              Audit Reports
            </button>
            <button
              onClick={() => setActiveTab("settings")}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition ${
                activeTab === "settings" ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 font-semibold" : "text-slate-300 hover:bg-slate-800/60 hover:text-white"
              }`}
            >
              <Settings className="w-4 h-4 text-slate-400" />
              Settings & Integrations
            </button>
            <button
              onClick={() => setActiveTab("docs")}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition ${
                activeTab === "docs" ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 font-semibold" : "text-slate-300 hover:bg-slate-800/60 hover:text-white"
              }`}
            >
              <BookOpen className="w-4 h-4 text-slate-400" />
              Architecture & Runbooks
            </button>
          </nav>
        </div>

        {/* Real Data Policy Indicator */}
        <div className="p-3 border-t border-slate-800 bg-[#080C14]">
          <div className="flex items-center gap-2 text-[11px] text-emerald-400 font-mono mb-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Real Data Policy: STRICT</span>
          </div>
          <p className="text-[10px] text-slate-500 leading-tight">
            Synthetic data is rejected. All metrics reflect genuine Playwright & ADB execution.
          </p>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {/* Top Header */}
        <header className="h-16 border-b border-slate-800 bg-[#0D131F]/90 backdrop-blur px-8 flex items-center justify-between shrink-0 sticky top-0 z-30">
          <div className="flex items-center gap-4">
            <h2 className="text-sm font-bold text-white capitalize tracking-wide">
              {activeTab.replace("_", " ")}
            </h2>
            {testStep && (
              <div className="flex items-center gap-2 px-3 py-1 bg-cyan-950/80 border border-cyan-500/40 rounded-full text-xs font-mono text-cyan-300 animate-pulse">
                <Terminal className="w-3.5 h-3.5" />
                <span>{testStep}</span>
              </div>
            )}
          </div>

          {/* Infrastructure Health Status Badges */}
          <div className="flex items-center gap-2.5 text-xs font-mono">
            <div
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md border ${
                systemHealth?.database?.status === "connected" || systemHealth?.database?.status === "connected_fallback"
                  ? "bg-emerald-950/40 border-emerald-800/50 text-emerald-400"
                  : "bg-red-950/40 border-red-800/50 text-red-400"
              }`}
              title="Database Status (PostgreSQL with SQLite local fallback)"
            >
              <Database className="w-3 h-3" />
              <span>DB: {systemHealth?.database?.database_type || "Postgres"}</span>
            </div>

            <div
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md border ${
                systemHealth?.neo4j?.connected
                  ? "bg-emerald-950/40 border-emerald-800/50 text-emerald-400"
                  : "bg-amber-950/40 border-amber-800/50 text-amber-400"
              }`}
              title="Neo4j Graph Database Status"
            >
              <Layers className="w-3 h-3" />
              <span>Neo4j: {systemHealth?.neo4j?.connected ? "Online" : "Disconnected"}</span>
            </div>

            <div
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md border ${
                systemHealth?.android_adb?.available
                  ? "bg-emerald-950/40 border-emerald-800/50 text-emerald-400"
                  : "bg-slate-900 border-slate-700 text-slate-400"
              }`}
              title="Android ADB Hardware Bridge"
            >
              <Smartphone className="w-3 h-3" />
              <span>ADB: {systemHealth?.android_adb?.available ? "Ready" : "Setup Req"}</span>
            </div>

            <button
              onClick={refreshHealth}
              className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-white rounded transition"
              title="Refresh Health"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </header>

        {/* Global Error Banner */}
        {errorBanner && (
          <div className="m-6 mb-0 p-4 bg-red-950/60 border border-red-500/50 rounded-xl flex items-center justify-between text-xs text-red-200">
            <div className="flex items-center gap-3">
              <AlertOctagon className="w-4 h-4 text-red-400 shrink-0" />
              <span>{errorBanner}</span>
            </div>
            <button onClick={() => setErrorBanner(null)} className="hover:text-white">
              ✕
            </button>
          </div>
        )}

        {/* Views */}
        <div className="p-8 max-w-7xl mx-auto w-full space-y-8">
          {/* TAB 1: OVERVIEW & DASHBOARD */}
          {activeTab === "overview" && (
            <div className="space-y-8">
              {/* Hero Banner */}
              <div className="relative rounded-2xl bg-gradient-to-r from-[#0F172A] via-[#101D33] to-[#0A101C] p-8 border border-slate-800 overflow-hidden">
                <div className="relative z-10 max-w-2xl">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-xs font-mono mb-4">
                    <ShieldCheck className="w-3.5 h-3.5" /> Evidence-Grounded Device Intelligence
                  </div>
                  <h1 className="text-3xl font-extrabold text-white tracking-tight mb-3">
                    Know how your app performs on <span className="text-cyan-400">Entry-Level</span> devices.
                  </h1>
                  <p className="text-slate-300 text-sm leading-relaxed mb-6">
                    Developers build on high-end workstations and flagship phones. Actual users run budget chips, 2GB RAM, and throttled 3G cellular. TierLens exposes regressions before your users do.
                  </p>
                  <div className="flex items-center gap-4">
                    <button
                      onClick={() => setActiveTab("web_test")}
                      className="px-5 py-2.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-black font-semibold text-xs transition flex items-center gap-2 shadow-lg shadow-cyan-500/20"
                    >
                      <Play className="w-4 h-4 fill-black" /> Run Dual Web Test
                    </button>
                    <button
                      onClick={() => setActiveTab("android_test")}
                      className="px-5 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-medium text-xs transition flex items-center gap-2 border border-slate-700"
                    >
                      <Upload className="w-4 h-4" /> Inspect Android APK
                    </button>
                  </div>
                </div>
              </div>

              {/* High-Level Stat Cards */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="p-5 rounded-xl bg-[#0D131F] border border-slate-800">
                  <span className="text-xs text-slate-400 font-medium">Core Web Vitals Engine</span>
                  <div className="text-2xl font-bold text-white mt-1">Playwright + CDP</div>
                  <div className="text-[11px] text-cyan-400 mt-2 font-mono flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> 4x & 8x CPU Throttling
                  </div>
                </div>

                <div className="p-5 rounded-xl bg-[#0D131F] border border-slate-800">
                  <span className="text-xs text-slate-400 font-medium">Android APK Engine</span>
                  <div className="text-2xl font-bold text-white mt-1">ADB + Logcat</div>
                  <div className="text-[11px] text-emerald-400 mt-2 font-mono flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> ANR & Memory Profiling
                  </div>
                </div>

                <div className="p-5 rounded-xl bg-[#0D131F] border border-slate-800">
                  <span className="text-xs text-slate-400 font-medium">Knowledge Graph</span>
                  <div className="text-2xl font-bold text-white mt-1">Neo4j Bolt 5.20</div>
                  <div className="text-[11px] text-amber-400 mt-2 font-mono flex items-center gap-1">
                    <Layers className="w-3.5 h-3.5" /> Signature Deduplication
                  </div>
                </div>

                <div className="p-5 rounded-xl bg-[#0D131F] border border-slate-800">
                  <span className="text-xs text-slate-400 font-medium">Root Cause Engine</span>
                  <div className="text-2xl font-bold text-white mt-1">Deterministic + AI</div>
                  <div className="text-[11px] text-pink-400 mt-2 font-mono flex items-center gap-1">
                    <Brain className="w-3.5 h-3.5" /> Zero-Hallucination Fallback
                  </div>
                </div>
              </div>

              {/* Quick Test Bar */}
              <div className="p-6 rounded-xl bg-[#0D131F] border border-slate-800">
                <h3 className="text-sm font-bold text-white mb-2">Execute Immediate Dual-Tier Comparison</h3>
                <p className="text-xs text-slate-400 mb-4">
                  Enter any public HTTPS URL. TierLens executes headless Chromium instances in parallel across Good Budget (4x CPU, Fast 3G) and Entry-Level (8x CPU, Slow 3G).
                </p>
                <form onSubmit={handleExecuteWebTest} className="flex gap-3">
                  <input
                    type="url"
                    value={testUrl}
                    onChange={e => setTestUrl(e.target.value)}
                    placeholder="https://example.com"
                    required
                    className="flex-1 bg-[#080C14] border border-slate-700 rounded-lg px-4 py-2.5 text-xs text-white focus:outline-none focus:border-cyan-500 font-mono"
                  />
                  <button
                    type="submit"
                    disabled={isRunningTest}
                    className="px-6 py-2.5 bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-black font-bold text-xs rounded-lg transition shrink-0 flex items-center gap-2"
                  >
                    {isRunningTest ? <RotateCcw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-black" />}
                    {isRunningTest ? "Running Test..." : "Start Dual Test"}
                  </button>
                </form>
              </div>
            </div>
          )}

          {/* TAB 2: WEBSITE TESTING */}
          {activeTab === "web_test" && (
            <div className="space-y-6">
              <div className="p-6 rounded-xl bg-[#0D131F] border border-slate-800">
                <h2 className="text-base font-bold text-white mb-1">Engine A: Website Performance Testing</h2>
                <p className="text-xs text-slate-400 mb-6">
                  Executes automated Playwright tests with real Chrome DevTools Protocol network and CPU throttling.
                </p>

                <form onSubmit={handleExecuteWebTest} className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">Target Application URL</label>
                    <input
                      type="url"
                      value={testUrl}
                      onChange={e => setTestUrl(e.target.value)}
                      placeholder="https://your-domain.com"
                      required
                      className="w-full bg-[#080C14] border border-slate-700 rounded-lg px-4 py-2.5 text-xs text-white focus:outline-none focus:border-cyan-500 font-mono"
                    />
                    <span className="text-[11px] text-slate-500 mt-1 block">
                      Protected against SSRF: Private IP ranges (RFC 1918), loopback, and cloud metadata endpoints are strictly blocked.
                    </span>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">Testing Profile Mode</label>
                    <div className="grid grid-cols-3 gap-3">
                      <div
                        onClick={() => setSelectedTier("BOTH")}
                        className={`p-3 rounded-lg border cursor-pointer transition ${
                          selectedTier === "BOTH" ? "bg-cyan-500/10 border-cyan-500 text-white" : "bg-[#080C14] border-slate-800 text-slate-400 hover:border-slate-700"
                        }`}
                      >
                        <div className="font-bold text-xs">Dual Comparison (Both)</div>
                        <div className="text-[10px] text-slate-400 mt-1">Good Budget vs Entry-Level diff</div>
                      </div>
                      <div
                        onClick={() => setSelectedTier("GOOD_BUDGET")}
                        className={`p-3 rounded-lg border cursor-pointer transition ${
                          selectedTier === "GOOD_BUDGET" ? "bg-cyan-500/10 border-cyan-500 text-white" : "bg-[#080C14] border-slate-800 text-slate-400 hover:border-slate-700"
                        }`}
                      >
                        <div className="font-bold text-xs">Good Budget Only</div>
                        <div className="text-[10px] text-slate-400 mt-1">4x CPU, Fast 3G network</div>
                      </div>
                      <div
                        onClick={() => setSelectedTier("ENTRY_LEVEL")}
                        className={`p-3 rounded-lg border cursor-pointer transition ${
                          selectedTier === "ENTRY_LEVEL" ? "bg-cyan-500/10 border-cyan-500 text-white" : "bg-[#080C14] border-slate-800 text-slate-400 hover:border-slate-700"
                        }`}
                      >
                        <div className="font-bold text-xs">Entry-Level Only</div>
                        <div className="text-[10px] text-slate-400 mt-1">8x CPU, Slow 3G network</div>
                      </div>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isRunningTest}
                    className="px-6 py-2.5 bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-black font-bold text-xs rounded-lg transition flex items-center gap-2"
                  >
                    {isRunningTest ? <RotateCcw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-black" />}
                    {isRunningTest ? "Executing Playwright Chromium Test..." : "Execute Web Test"}
                  </button>
                </form>
              </div>
            </div>
          )}

          {/* TAB 3: ANDROID APK TESTING */}
          {activeTab === "android_test" && (
            <div className="space-y-6">
              <div className="p-6 rounded-xl bg-[#0D131F] border border-slate-800">
                <h2 className="text-base font-bold text-white mb-1">Engine B: Android APK Performance Testing</h2>
                <p className="text-xs text-slate-400 mb-6">
                  Upload an Android APK to inspect its manifest, permissions, and run automated launch, logcat, crash, and ANR detection via host ADB.
                </p>

                {/* ADB Diagnostic Banner */}
                <div className={`p-4 rounded-xl border mb-6 ${
                  deviceLabStatus?.adb?.available ? "bg-emerald-950/20 border-emerald-800/40" : "bg-amber-950/20 border-amber-800/40"
                }`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Smartphone className={`w-5 h-5 ${deviceLabStatus?.adb?.available ? "text-emerald-400" : "text-amber-400"}`} />
                      <div>
                        <div className="text-xs font-bold text-white">
                          Host ADB Status: {deviceLabStatus?.adb?.status || "SETUP_REQUIRED"}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          {deviceLabStatus?.adb?.available
                            ? `Version: ${deviceLabStatus?.adb?.version}`
                            : "Android SDK / ADB was not detected in system PATH. Install Android Studio or add platform-tools to PATH."}
                        </div>
                      </div>
                    </div>
                    <span className="px-2.5 py-1 rounded text-[10px] font-mono font-bold bg-[#080C14] border border-slate-700 text-slate-300">
                      Devices Connected: {deviceLabStatus?.device_count || 0}
                    </span>
                  </div>
                </div>

                {/* Upload Box */}
                <div className="border-2 border-dashed border-slate-700 hover:border-cyan-500/60 rounded-xl p-8 text-center bg-[#080C14]/60 transition">
                  <Upload className="w-8 h-8 text-cyan-400 mx-auto mb-3" />
                  <h4 className="text-xs font-bold text-white mb-1">Drop Android APK here or click to browse</h4>
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
                    className="cursor-pointer px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-medium border border-slate-700 inline-block"
                  >
                    {isUploadingApk ? "Validating APK Archive..." : "Select APK File"}
                  </label>
                </div>

                {/* APK Manifest Details */}
                {apkManifest && (
                  <div className="mt-6 p-5 rounded-xl bg-[#080C14] border border-slate-800 font-mono text-xs space-y-3">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                      <span className="text-cyan-400 font-bold">APK Validation & Manifest Extraction</span>
                      <span className="text-[10px] bg-emerald-950 text-emerald-400 border border-emerald-800 px-2 py-0.5 rounded">VALID ARCHIVE</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <div><span className="text-slate-500">Package Name:</span> <span className="text-white">{apkManifest.package_name}</span></div>
                      <div><span className="text-slate-500">Version:</span> <span className="text-white">{apkManifest.version_name} (Code: {apkManifest.version_code})</span></div>
                      <div><span className="text-slate-500">File Size:</span> <span className="text-white">{apkManifest.file_size_mb} MB</span></div>
                      <div><span className="text-slate-500">SHA256:</span> <span className="text-white truncate block">{apkManifest.sha256}</span></div>
                    </div>
                    <div>
                      <span className="text-slate-500 text-[10px]">Requested Permissions ({apkManifest.permissions?.length || 0}):</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {apkManifest.permissions?.map((p: string) => (
                          <span key={p} className="px-1.5 py-0.5 bg-slate-900 border border-slate-800 rounded text-[10px] text-slate-300">
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

          {/* TAB 4: DEVICE COMPARISON (CENTRAL DIFFERENTIATOR) */}
          {activeTab === "compare" && (
            <div className="space-y-6">
              <div className="p-6 rounded-xl bg-[#0D131F] border border-slate-800">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-base font-bold text-white flex items-center gap-2">
                      <GitCompare className="w-5 h-5 text-cyan-400" />
                      Side-by-Side Device Comparison & Degradation
                    </h2>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Differential analysis between Good Budget and Entry-Level performance profiles.
                    </p>
                  </div>
                  {comparisonData?.comparison_group_id && (
                    <span className="text-[10px] font-mono text-slate-500 bg-[#080C14] px-2.5 py-1 rounded border border-slate-800">
                      Group ID: {comparisonData.comparison_group_id.slice(0, 8)}...
                    </span>
                  )}
                </div>

                {!comparisonData ? (
                  <div className="p-12 text-center text-slate-500 text-xs">
                    No comparison test loaded yet. Go to <button onClick={() => setActiveTab("web_test")} className="text-cyan-400 underline">Website Testing</button> and run a Dual Test to see side-by-side results.
                  </div>
                ) : (
                  <div className="space-y-6">
                    {/* Visual Comparison Chart */}
                    <div className="p-4 bg-[#080C14] border border-slate-800 rounded-xl">
                      <h4 className="text-xs font-bold text-slate-300 mb-4">Core Web Vitals Metric Differential</h4>
                      <div className="h-64 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={comparisonChartData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
                            <XAxis dataKey="name" stroke="#64748B" fontSize={11} />
                            <YAxis stroke="#64748B" fontSize={11} />
                            <Tooltip
                              contentStyle={{ backgroundColor: "#0F172A", borderColor: "#334155", fontSize: "11px" }}
                            />
                            <Bar dataKey="Good Budget" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                            <Bar dataKey="Entry-Level" fill="#06B6D4" radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    {/* Side-by-Side Profile Table */}
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-slate-800 text-slate-400">
                            <th className="py-2.5 px-3">Metric</th>
                            <th className="py-2.5 px-3 text-blue-400">Good Budget Profile</th>
                            <th className="py-2.5 px-3 text-cyan-400">Entry-Level Profile</th>
                            <th className="py-2.5 px-3">Degradation / Delta</th>
                            <th className="py-2.5 px-3">Rating</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800 font-mono">
                          {Object.entries(comparisonData.metrics_diff || {}).map(([key, val]: [string, any]) => {
                            const isRegressed = val.pct_change >= 25;
                            return (
                              <tr key={key} className={isRegressed ? "bg-red-950/10" : ""}>
                                <td className="py-3 px-3 font-bold text-white">{key}</td>
                                <td className="py-3 px-3 text-slate-300">{val.good_budget} {val.unit}</td>
                                <td className="py-3 px-3 text-slate-300">{val.entry_level} {val.unit}</td>
                                <td className="py-3 px-3">
                                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                    isRegressed ? "bg-red-950 text-red-400 border border-red-800" : "bg-emerald-950 text-emerald-400"
                                  }`}>
                                    +{val.pct_change}% (+{val.delta} {val.unit})
                                  </span>
                                </td>
                                <td className="py-3 px-3 text-[11px]">
                                  {isRegressed ? (
                                    <span className="text-red-400 font-sans font-medium flex items-center gap-1">
                                      <TrendingDown className="w-3.5 h-3.5" /> Severe Degradation
                                    </span>
                                  ) : (
                                    <span className="text-emerald-400 font-sans font-medium flex items-center gap-1">
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

                    {/* Device-Specific Failures Callout */}
                    {comparisonData.device_specific_failures?.length > 0 && (
                      <div className="p-4 bg-red-950/30 border border-red-800/60 rounded-xl">
                        <div className="flex items-center gap-2 text-xs font-bold text-red-400 mb-2">
                          <AlertOctagon className="w-4 h-4" />
                          <span>Entry-Level Exclusive Failure Detected</span>
                        </div>
                        <p className="text-xs text-slate-300 mb-3">
                          The following issues triggered on the Entry-Level profile but completed cleanly on the Good Budget profile:
                        </p>
                        {comparisonData.device_specific_failures.map((f: any, idx: number) => (
                          <div key={idx} className="bg-[#080C14] p-3 rounded-lg border border-red-900/40 text-xs font-mono">
                            <div className="font-bold text-white">{f.title}</div>
                            <div className="text-[11px] text-slate-400 mt-1">{f.message}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 5: FAILURE EXPLORER */}
          {activeTab === "failures" && (
            <div className="space-y-6">
              <div className="p-6 rounded-xl bg-[#0D131F] border border-slate-800">
                <h2 className="text-base font-bold text-white mb-1">Failure Explorer & Error Signatures</h2>
                <p className="text-xs text-slate-400 mb-6">
                  Deduplicated runtime exceptions, JavaScript errors, and network HTTP failures captured during real browser sessions.
                </p>

                {(!comparisonData?.entry_level_run?.failures || comparisonData.entry_level_run.failures.length === 0) ? (
                  <div className="p-8 text-center text-slate-500 text-xs bg-[#080C14] rounded-xl border border-slate-800">
                    Zero fatal exceptions detected in active run session.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {comparisonData.entry_level_run.failures.map((fail: any) => (
                      <div key={fail.id} className="p-4 rounded-xl bg-[#080C14] border border-slate-800 font-mono text-xs">
                        <div className="flex items-center justify-between mb-2">
                          <span className="px-2 py-0.5 rounded text-[10px] bg-red-950 text-red-400 border border-red-800 font-bold">
                            {fail.failure_type}
                          </span>
                          <span className="text-[10px] text-slate-500">
                            Sig: {fail.error_signature}
                          </span>
                        </div>
                        <h4 className="font-bold text-white text-sm mb-1">{fail.title}</h4>
                        <p className="text-slate-400 text-[11px] mb-2">{fail.message}</p>
                        {fail.url_or_file && (
                          <div className="text-[10px] text-cyan-400/80 truncate">
                            Source: {fail.url_or_file}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 6: ROOT CAUSE ANALYSIS & OPTIMIZATIONS */}
          {(activeTab === "rca" || activeTab === "optimizations") && (
            <div className="space-y-6">
              <div className="p-6 rounded-xl bg-[#0D131F] border border-slate-800">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-base font-bold text-white flex items-center gap-2">
                      <Brain className="w-5 h-5 text-pink-400" />
                      Evidence-Grounded Root Cause & Fix Workflow
                    </h2>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Developer Workflow: Finding → Investigate → Apply Fix → Rerun → Verify
                    </p>
                  </div>
                </div>

                {recommendations.length === 0 ? (
                  <div className="p-8 text-center text-slate-500 text-xs bg-[#080C14] rounded-xl border border-slate-800">
                    No active recommendations generated. Run a test to analyze bottlenecks.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {recommendations.map((rec: any) => (
                      <div key={rec.id} className="p-5 rounded-xl bg-[#080C14] border border-slate-800 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-pink-950 text-pink-400 border border-pink-800">
                              {rec.category || "Performance"}
                            </span>
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-950 text-amber-400 border border-amber-800">
                              Impact: {rec.impact || "HIGH"}
                            </span>
                          </div>
                          <span className={`text-[10px] font-mono px-2 py-0.5 rounded ${
                            rec.status === "VERIFIED" ? "bg-emerald-950 text-emerald-400 border border-emerald-800" :
                            rec.status === "APPLIED" ? "bg-cyan-950 text-cyan-400 border border-cyan-800" : "bg-slate-800 text-slate-300"
                          }`}>
                            Status: {rec.status}
                          </span>
                        </div>

                        <h3 className="text-sm font-bold text-white">{rec.title}</h3>

                        {/* Probable Cause */}
                        <div className="p-3 bg-[#0D131F] rounded-lg border border-slate-800 text-xs">
                          <div className="text-slate-400 font-semibold mb-1">Probable Root Cause:</div>
                          <p className="text-slate-200 leading-relaxed">{rec.probable_cause}</p>
                        </div>

                        {/* Remediation */}
                        <div className="p-3 bg-[#0D131F] rounded-lg border border-slate-800 text-xs font-mono">
                          <div className="text-cyan-400 font-semibold mb-1">Recommended Remediation:</div>
                          <p className="text-slate-300 whitespace-pre-line leading-relaxed">{rec.remediation}</p>
                        </div>

                        {/* Verification */}
                        <div className="p-3 bg-[#0D131F] rounded-lg border border-slate-800 text-xs font-mono">
                          <div className="text-emerald-400 font-semibold mb-1">Verification Steps:</div>
                          <p className="text-slate-300 whitespace-pre-line leading-relaxed">{rec.verification_steps}</p>
                        </div>

                        {/* Workflow Actions */}
                        <div className="flex items-center gap-3 pt-2">
                          <button
                            onClick={() => handleStatusUpdate(rec.id, "APPLIED")}
                            className="px-3.5 py-1.5 rounded bg-cyan-600 hover:bg-cyan-500 text-black font-bold text-xs transition"
                          >
                            Mark Fix Applied
                          </button>
                          <button
                            onClick={() => handleStatusUpdate(rec.id, "VERIFIED")}
                            className="px-3.5 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-black font-bold text-xs transition"
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
              <div className="p-6 rounded-xl bg-[#0D131F] border border-slate-800">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-base font-bold text-white flex items-center gap-2">
                      <Database className="w-5 h-5 text-amber-400" />
                      Neo4j Knowledge Graph Intelligence
                    </h2>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Visualizing relationships between Applications, Runs, Profiles, Metrics, Failures, and Error Signatures.
                    </p>
                  </div>
                  <button
                    onClick={refreshHealth}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs font-medium rounded-lg text-slate-200 transition"
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
              <div className="p-6 rounded-xl bg-[#0D131F] border border-slate-800">
                <h2 className="text-base font-bold text-white mb-1">Device Lab & Testing Profile Specifications</h2>
                <p className="text-xs text-slate-400 mb-6">
                  Hardware and network constraints emulated during test sessions.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Good Budget */}
                  <div className="p-5 rounded-xl bg-[#080C14] border border-blue-500/30 space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sm text-blue-400">Good Budget Tier</span>
                      <span className="text-[10px] font-mono bg-blue-950 text-blue-300 border border-blue-800 px-2 py-0.5 rounded">~$150-$200 Bracket</span>
                    </div>
                    <p className="text-xs text-slate-400">Representative of Samsung Galaxy A14 / Moto G series.</p>
                    <div className="space-y-2 text-xs font-mono">
                      <div className="flex justify-between border-b border-slate-800 py-1.5">
                        <span className="text-slate-500">CPU Throttling:</span>
                        <span className="text-white">4x Slowdown</span>
                      </div>
                      <div className="flex justify-between border-b border-slate-800 py-1.5">
                        <span className="text-slate-500">Network Simulation:</span>
                        <span className="text-white">Fast 3G (1.6 Mbps / 40ms)</span>
                      </div>
                      <div className="flex justify-between border-b border-slate-800 py-1.5">
                        <span className="text-slate-500">Viewport:</span>
                        <span className="text-white">390 x 844 (Scale 2.5)</span>
                      </div>
                      <div className="flex justify-between py-1.5">
                        <span className="text-slate-500">RAM:</span>
                        <span className="text-white">4,096 MB</span>
                      </div>
                    </div>
                  </div>

                  {/* Entry-Level */}
                  <div className="p-5 rounded-xl bg-[#080C14] border border-cyan-500/30 space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sm text-cyan-400">Entry-Level Tier</span>
                      <span className="text-[10px] font-mono bg-cyan-950 text-cyan-300 border border-cyan-800 px-2 py-0.5 rounded">~$70-$100 Bracket</span>
                    </div>
                    <p className="text-xs text-slate-400">Representative of Redmi 9A / Nokia C-series.</p>
                    <div className="space-y-2 text-xs font-mono">
                      <div className="flex justify-between border-b border-slate-800 py-1.5">
                        <span className="text-slate-500">CPU Throttling:</span>
                        <span className="text-white">8x Slowdown</span>
                      </div>
                      <div className="flex justify-between border-b border-slate-800 py-1.5">
                        <span className="text-slate-500">Network Simulation:</span>
                        <span className="text-white">Slow 3G (500 kbps / 200ms)</span>
                      </div>
                      <div className="flex justify-between border-b border-slate-800 py-1.5">
                        <span className="text-slate-500">Viewport:</span>
                        <span className="text-white">360 x 800 (Scale 2.0)</span>
                      </div>
                      <div className="flex justify-between py-1.5">
                        <span className="text-slate-500">RAM:</span>
                        <span className="text-white">2,048 MB</span>
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
              <div className="p-6 rounded-xl bg-[#0D131F] border border-slate-800 space-y-4">
                <h2 className="text-base font-bold text-white">TierLens Platform Documentation & Architecture</h2>
                <p className="text-xs text-slate-400 leading-relaxed">
                  TierLens is a full-stack Application Performance & Device Intelligence platform written in Python (FastAPI, SQLAlchemy, Playwright) and TypeScript (Next.js 14, Tailwind CSS, Recharts).
                </p>

                <div className="space-y-3 font-mono text-xs text-slate-300">
                  <div className="p-3 bg-[#080C14] rounded-lg border border-slate-800">
                    <span className="text-cyan-400 font-bold">1. Starting Backend Services</span>
                    <pre className="text-[11px] text-slate-400 mt-1">$ docker compose up -d postgres neo4j redis</pre>
                  </div>
                  <div className="p-3 bg-[#080C14] rounded-lg border border-slate-800">
                    <span className="text-cyan-400 font-bold">2. Running Local FastAPI Server</span>
                    <pre className="text-[11px] text-slate-400 mt-1">$ backend\.venv\Scripts\uvicorn.exe app.main:app --reload --port 8000</pre>
                  </div>
                  <div className="p-3 bg-[#080C14] rounded-lg border border-slate-800">
                    <span className="text-cyan-400 font-bold">3. Running Next.js Frontend</span>
                    <pre className="text-[11px] text-slate-400 mt-1">$ cd frontend && npm run dev</pre>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 10: SETTINGS */}
          {activeTab === "settings" && (
            <div className="space-y-6">
              <div className="p-6 rounded-xl bg-[#0D131F] border border-slate-800 space-y-4">
                <h2 className="text-base font-bold text-white">Platform Settings & Service Endpoints</h2>
                <div className="space-y-3 text-xs font-mono">
                  <div>
                    <label className="text-slate-400 block mb-1">FastAPI Backend URL</label>
                    <input
                      type="text"
                      readOnly
                      value="http://localhost:8000"
                      className="w-full bg-[#080C14] border border-slate-700 rounded p-2 text-slate-200"
                    />
                  </div>
                  <div>
                    <label className="text-slate-400 block mb-1">Neo4j Bolt URI</label>
                    <input
                      type="text"
                      readOnly
                      value="bolt://localhost:7687"
                      className="w-full bg-[#080C14] border border-slate-700 rounded p-2 text-slate-200"
                    />
                  </div>
                  <div>
                    <label className="text-slate-400 block mb-1">PostgreSQL URI</label>
                    <input
                      type="text"
                      readOnly
                      value="postgresql+asyncpg://tierlens:tierlens_secure_pass@localhost:5432/tierlens_db"
                      className="w-full bg-[#080C14] border border-slate-700 rounded p-2 text-slate-200"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 11: AUDIT REPORTS */}
          {activeTab === "reports" && (
            <div className="space-y-6">
              <div className="p-6 rounded-xl bg-[#0D131F] border border-slate-800">
                <h2 className="text-base font-bold text-white mb-2">Audit Reports & Quality Assurance Log</h2>
                <p className="text-xs text-slate-400 mb-6">
                  Certified audit log of all completed dual-device test sessions and verification records.
                </p>
                <div className="p-8 text-center text-slate-500 text-xs bg-[#080C14] rounded-xl border border-slate-800">
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
