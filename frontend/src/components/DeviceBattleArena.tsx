"use client";

import React, { useState, useEffect } from "react";
import {
  GitCompare,
  Play,
  RotateCcw,
  Trophy,
  AlertOctagon,
  Smartphone,
  Monitor,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  ChevronRight,
  TrendingDown,
  Layers,
  Cpu,
  Wifi,
  Eye,
  FileText,
  Sparkles,
  Info
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend
} from "recharts";
import { ApiClient } from "@/lib/api";
import HealthScoreCard, { calculateWebsiteHealthScore } from "./HealthScoreCard";
import VisualEvidenceViewer from "./VisualEvidenceViewer";

export interface ArenaPreset {
  id: string;
  name: string;
  tier: string;
  device_type: string;
  cpu_cores: number;
  cpu_throttle_rate: number;
  ram_mb: number;
  network_profile: string;
  viewport: { width: number; height: number };
  selected: boolean;
}

const DEFAULT_PRESETS: ArenaPreset[] = [
  {
    id: "ENTRY_LEVEL",
    name: "Entry-Level Android (Redmi 9A)",
    tier: "ENTRY_LEVEL",
    device_type: "Entry-level Android",
    cpu_cores: 2,
    cpu_throttle_rate: 8.0,
    ram_mb: 2048,
    network_profile: "Slow 3G (500 Kbps / 200ms)",
    viewport: { width: 360, height: 800 },
    selected: true
  },
  {
    id: "GOOD_BUDGET",
    name: "Budget Android (Galaxy A14)",
    tier: "GOOD_BUDGET",
    device_type: "Budget Android",
    cpu_cores: 4,
    cpu_throttle_rate: 4.0,
    ram_mb: 4096,
    network_profile: "Fast 3G (1.6 Mbps / 40ms)",
    viewport: { width: 390, height: 844 },
    selected: true
  },
  {
    id: "MID_RANGE",
    name: "Mid-Range Android (Pixel 6a)",
    tier: "MID_RANGE",
    device_type: "Mid-range Android",
    cpu_cores: 6,
    cpu_throttle_rate: 2.0,
    ram_mb: 6144,
    network_profile: "Regular 4G (4 Mbps / 20ms)",
    viewport: { width: 412, height: 915 },
    selected: true
  },
  {
    id: "HIGH_END",
    name: "Flagship Android (Galaxy S23)",
    tier: "HIGH_END",
    device_type: "Flagship Android",
    cpu_cores: 8,
    cpu_throttle_rate: 1.0,
    ram_mb: 8192,
    network_profile: "High-speed 5G (15 Mbps / 10ms)",
    viewport: { width: 393, height: 852 },
    selected: false
  },
  {
    id: "DESKTOP_STANDARD",
    name: "Desktop Standard (MacBook / PC)",
    tier: "DESKTOP_STANDARD",
    device_type: "Desktop Laptop",
    cpu_cores: 8,
    cpu_throttle_rate: 1.0,
    ram_mb: 16384,
    network_profile: "Broadband Fiber (50 Mbps / 5ms)",
    viewport: { width: 1440, height: 900 },
    selected: true
  }
];

interface DeviceBattleArenaProps {
  initialUrl?: string;
  onOpenAuditReport?: (jobId: string, runId?: string, payload?: any) => void;
  onOpenLiveArena?: (jobId: string) => void;
}

export default function DeviceBattleArena({
  initialUrl = "https://scan2eat.food",
  onOpenAuditReport,
  onOpenLiveArena
}: DeviceBattleArenaProps) {
  const [targetUrl, setTargetUrl] = useState(initialUrl);
  const [presets, setPresets] = useState<ArenaPreset[]>(DEFAULT_PRESETS);
  const [isRunning, setIsRunning] = useState(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [comparisonData, setComparisonData] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [selectedDeviceIndex, setSelectedDeviceIndex] = useState<number | null>(null);
  const [showEvidenceModal, setShowEvidenceModal] = useState(false);
  const [currentStage, setCurrentStage] = useState<string>("Initializing Benchmark...");
  const [progressMsg, setProgressMsg] = useState<string>("Preparing device profiles...");

  const togglePreset = (id: string) => {
    setPresets((prev) =>
      prev.map((p) => (p.id === id ? { ...p, selected: !p.selected } : p))
    );
  };

  const selectedCount = presets.filter((p) => p.selected).length;

  // Launch Multi-Device Shootout
  const handleLaunchBattle = async () => {
    if (!targetUrl.trim()) return;
    const selectedDevices = presets.filter((p) => p.selected);
    if (selectedDevices.length < 2) {
      setErrorMsg("Please select at least 2 device configurations for side-by-side shootout.");
      return;
    }

    setErrorMsg(null);
    setIsRunning(true);
    setComparisonData(null);
    setCurrentStage("Initializing Benchmark...");
    setProgressMsg("Allocating device execution profiles...");

    try {
      // Map selected presets to custom profile payload
      const customProfilesPayload = selectedDevices.map((d) => ({
        id: d.id,
        name: d.name,
        tier: d.tier,
        device_type: d.device_type,
        cpu_cores: d.cpu_cores,
        cpu_throttle_rate: d.cpu_throttle_rate,
        ram_mb: d.ram_mb,
        network_profile: d.network_profile,
        viewport_width: d.viewport.width,
        viewport_height: d.viewport.height,
        device_scale_factor: d.device_type.includes("Desktop") ? 1.0 : 2.5,
        is_mobile: !d.device_type.includes("Desktop"),
        has_touch: !d.device_type.includes("Desktop"),
        user_agent: d.device_type.includes("Desktop")
          ? "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
          : "Mozilla/5.0 (Linux; Android 12; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36"
      }));

      const res = await ApiClient.runWebTest({
        target_url: targetUrl.trim(),
        custom_profiles: customProfilesPayload
      });

      if (res && res.job_id) {
        setActiveJobId(res.job_id);
      } else {
        throw new Error("No job_id returned by test runner.");
      }
    } catch (err: any) {
      setIsRunning(false);
      setErrorMsg(err.message || "Failed to start device battle.");
    }
  };

  // Poll for multi-comparison results
  useEffect(() => {
    if (!activeJobId) return;

    let active = true;
    const interval = setInterval(async () => {
      try {
        const statusRes = await ApiClient.getWebJobStatus(activeJobId);
        if (!active) return;

        if (statusRes.stage) setCurrentStage(statusRes.stage);
        if (statusRes.progress_message) setProgressMsg(statusRes.progress_message);

        if (
          statusRes.status === "COMPLETED" ||
          statusRes.status === "COMPLETED_WITH_WARNINGS" ||
          statusRes.status === "PARTIAL"
        ) {
          setIsRunning(false);
          clearInterval(interval);
          if (statusRes.comparison_data) {
            setComparisonData(statusRes.comparison_data);
          } else if (statusRes.comparison_group_id) {
            const comp = await ApiClient.getComparison(statusRes.comparison_group_id);
            setComparisonData(comp);
          }
        } else if (statusRes.status === "FAILED" || statusRes.status === "CANCELLED") {
          setIsRunning(false);
          clearInterval(interval);
          setErrorMsg(statusRes.progress_message || "Device battle execution failed.");
        }
      } catch (e) {
        console.error("Battle polling error:", e);
      }
    }, 2000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [activeJobId]);

  // Extract run list
  const runs: any[] = comparisonData?.runs || [];

  // Build chart dataset
  const chartData = runs.map((r: any) => {
    const profName = r.device_profile?.name || r.id?.substring(0, 8);
    const mDict: Record<string, number> = {};
    (r.metrics || []).forEach((m: any) => {
      mDict[m.name] = Number(m.value);
    });

    return {
      name: profName.length > 18 ? profName.substring(0, 15) + "..." : profName,
      fullName: profName,
      LCP: mDict["LCP"] || 0,
      FCP: mDict["FCP"] || 0,
      LoadTime: mDict["PAGE_LOAD_TIME"] || 0,
      TransferKB: mDict["TRANSFER_SIZE_KB"] || 0
    };
  });

  return (
    <div className="space-y-6">
      {/* Top Configuration & Launch Card */}
      <div className="bg-white border border-[#E6E2D9] rounded-xl p-5 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-[#E6E2D9]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#F8E9DF] text-[#D97745] flex items-center justify-center font-bold">
              <GitCompare className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-[#252525]">Device Battle Arena</h2>
              <p className="text-xs text-[#6B6B65]">
                Simultaneously benchmark the same website across multiple device tiers side-by-side
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {activeJobId && isRunning && onOpenLiveArena && (
              <button
                onClick={() => onOpenLiveArena(activeJobId)}
                className="text-xs px-3 py-2 rounded-lg border border-[#E6E2D9] bg-[#FAF9F5] text-[#D97745] font-semibold hover:bg-[#EEECE5] transition-colors"
              >
                Watch in Live Arena →
              </button>
            )}
            <button
              onClick={handleLaunchBattle}
              disabled={isRunning || selectedCount < 2}
              className="flex items-center gap-1.5 px-4 py-2 bg-[#D97745] hover:bg-[#B95E32] disabled:opacity-60 text-white text-xs font-semibold rounded-lg transition-colors shadow-xs"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>{isRunning ? "Testing in Progress..." : `Start Shootout (${selectedCount} Devices)`}</span>
            </button>
          </div>
        </div>

        {/* Input & Device Selector Grid */}
        <div className="pt-4 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <label className="text-xs font-semibold text-[#6B6B65] shrink-0">
              Target Website URL:
            </label>
            <input
              type="url"
              value={targetUrl}
              onChange={(e) => setTargetUrl(e.target.value)}
              placeholder="https://example.com"
              disabled={isRunning}
              className="flex-1 px-3 py-2 text-xs bg-[#FAF9F5] border border-[#E6E2D9] rounded-lg text-[#252525] focus:outline-hidden focus:border-[#D97745] disabled:opacity-60"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-[#6B6B65] block mb-2">
              Select Competitor Profiles ({selectedCount}/5 Selected):
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              {presets.map((p) => (
                <div
                  key={p.id}
                  onClick={() => !isRunning && togglePreset(p.id)}
                  className={`p-3 rounded-lg border cursor-pointer select-none transition-all ${
                    p.selected
                      ? "bg-[#F8E9DF]/70 border-[#D97745] text-[#252525] shadow-xs"
                      : "bg-[#FAF9F5] border-[#E6E2D9] text-[#6B6B65] hover:bg-[#EEECE5] opacity-70"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-white border border-[#E6E2D9]">
                      {p.tier}
                    </span>
                    <input
                      type="checkbox"
                      checked={p.selected}
                      onChange={() => {}}
                      className="rounded text-[#D97745] focus:ring-[#D97745]"
                    />
                  </div>
                  <h4 className="text-xs font-semibold leading-snug mb-1">{p.name}</h4>
                  <div className="space-y-0.5 text-[10px] text-[#6B6B65]">
                    <div>CPU: {p.cpu_cores} Cores ({p.cpu_throttle_rate}x Slowdown)</div>
                    <div>RAM: {Math.round(p.ram_mb / 1024)}GB | {p.viewport.width}x{p.viewport.height}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {errorMsg && (
          <div className="mt-4 p-3 bg-[#FCEEEF] border border-[#C6534B]/30 rounded-lg text-xs text-[#C6534B] flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}
      </div>

      {/* Live Benchmark Execution Status Banner */}
      {isRunning && (
        <div className="bg-white border border-[#D97745]/30 rounded-xl p-5 shadow-xs animate-in fade-in duration-300">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-[#E6E2D9]">
            <div className="flex items-center gap-3">
              <span className="w-9 h-9 rounded-lg bg-[#F8E9DF] text-[#D97745] flex items-center justify-center shrink-0">
                <Play className="w-4 h-4 fill-current animate-pulse" />
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-xs font-bold text-[#252525] uppercase tracking-wider">
                    Benchmarking Device Fleet ({selectedCount} Profiles)
                  </h4>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#D97745]/15 text-[#D97745] font-semibold animate-pulse">
                    RUNNING
                  </span>
                </div>
                <p className="text-xs text-[#6B6B65] mt-0.5">
                  {currentStage}: {progressMsg}
                </p>
              </div>
            </div>

            {onOpenLiveArena && activeJobId && (
              <button
                onClick={() => onOpenLiveArena(activeJobId)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#FAF9F5] hover:bg-[#EEECE5] border border-[#E6E2D9] text-[#D97745] text-xs font-semibold rounded-lg transition-colors self-start sm:self-auto shadow-2xs"
              >
                <span>Watch Live Streaming Logs</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="mt-3">
            <div className="w-full bg-[#EAE7DF] h-1.5 rounded-full overflow-hidden">
              <div className="bg-[#D97745] h-full rounded-full animate-pulse w-full" />
            </div>
            <div className="flex justify-between items-center text-[10px] text-[#96948D] mt-1.5 font-mono">
              <span>Job ID: {activeJobId || "Initializing..."}</span>
              <span>Measuring LCP, FCP, CLS, TTFB, and Long Tasks</span>
            </div>
          </div>
        </div>
      )}

      {/* Results Overview: Best & Worst Performers Callouts */}
      {comparisonData && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Best Performer Card */}
            <div className="bg-[#EAF4EE] border border-[#36865A]/30 rounded-xl p-4 flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-lg bg-[#36865A] text-white flex items-center justify-center shrink-0">
                <Trophy className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#36865A] block">
                  Best Overall Performer
                </span>
                <span className="text-sm font-bold text-[#252525] block truncate">
                  {comparisonData.best_configuration?.name || "Baseline"}
                </span>
                <span className="text-[11px] text-[#6B6B65]">
                  Lowest Latency & Optimal Render Speed
                </span>
              </div>
            </div>

            {/* Worst Performer Card */}
            <div className="bg-[#FCEEEF] border border-[#C6534B]/30 rounded-xl p-4 flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-lg bg-[#C6534B] text-white flex items-center justify-center shrink-0">
                <AlertOctagon className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#C6534B] block">
                  Highest Degradation
                </span>
                <span className="text-sm font-bold text-[#252525] block truncate">
                  {comparisonData.worst_configuration?.name || "Constrained Device"}
                </span>
                <span className="text-[11px] text-[#6B6B65]">
                  Severe CPU/Network Throttling Impact
                </span>
              </div>
            </div>

            {/* Cheap Phone Test Verdict */}
            <div className="bg-[#F8E9DF] border border-[#D97745]/30 rounded-xl p-4 flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-lg bg-[#D97745] text-white flex items-center justify-center shrink-0">
                <Smartphone className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#B95E32] block">
                  ₹8,000 Phone Viability
                </span>
                <span className="text-sm font-bold text-[#252525] block">
                  {comparisonData.cheap_phone_verdict?.passed ? "PASSED" : "FAILED"}
                </span>
                <span className="text-[11px] text-[#6B6B65] line-clamp-1">
                  {comparisonData.cheap_phone_verdict?.explanation || "Audited against entry-level parameters"}
                </span>
              </div>
            </div>
          </div>

          {/* Comparative Metrics Chart */}
          <div className="bg-white border border-[#E6E2D9] rounded-xl p-5 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-semibold text-[#6B6B65] uppercase tracking-wider flex items-center gap-2">
                <TrendingDown className="w-4 h-4 text-[#D97745]" />
                <span>Cross-Device Core Web Vitals Shootout</span>
              </h3>
              <span className="text-xs text-[#96948D]">
                Lower values indicate superior performance
              </span>
            </div>

            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#EEECE5" />
                  <XAxis dataKey="name" stroke="#6B6B65" fontSize={11} tickLine={false} />
                  <YAxis stroke="#6B6B65" fontSize={11} tickLine={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#FFFFFF",
                      border: "1px solid #E6E2D9",
                      borderRadius: "8px",
                      fontSize: "12px"
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: "11px", paddingTop: "10px" }} />
                  <Bar dataKey="LCP" fill="#D97745" name="LCP (ms)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="FCP" fill="#557DAA" name="FCP (ms)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="LoadTime" fill="#C58A35" name="Page Load (ms)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Side-by-Side Device Cards Grid */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-[#6B6B65] uppercase tracking-wider">
                Individual Device Performance Cards ({runs.length})
              </h3>
              <span className="text-xs text-[#96948D]">
                Click any device card to view detailed failures & visual evidence
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {runs.map((run: any, idx: number) => {
                const dp = run.device_profile || {};
                const mDict: Record<string, any> = {};
                (run.metrics || []).forEach((m: any) => {
                  mDict[m.name] = m.value;
                });

                const health = calculateWebsiteHealthScore(run.metrics || [], run.failures || []);
                const isSelected = selectedDeviceIndex === idx;

                return (
                  <div
                    key={run.id || idx}
                    onClick={() => setSelectedDeviceIndex(idx)}
                    className={`bg-white border rounded-xl p-4 cursor-pointer transition-all ${
                      isSelected
                        ? "border-[#D97745] ring-2 ring-[#D97745]/20 shadow-md"
                        : "border-[#E6E2D9] hover:border-[#D97745]/60 hover:shadow-xs"
                    }`}
                  >
                    <div className="flex items-center justify-between pb-3 border-b border-[#E6E2D9] mb-3">
                      <div>
                        <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-[#FAF9F5] border border-[#E6E2D9] text-[#6B6B65]">
                          {dp.tier || "TIER"}
                        </span>
                        <h4 className="text-sm font-semibold text-[#252525] mt-1 truncate">
                          {dp.name || `Device #${idx + 1}`}
                        </h4>
                      </div>
                      <div className="text-right">
                        <span
                          className="text-xs font-bold px-2 py-0.5 rounded-full"
                          style={{ backgroundColor: health.gradeBg, color: health.gradeColor }}
                        >
                          Score: {health.compositeScore}
                        </span>
                      </div>
                    </div>

                    {/* Hardware specs */}
                    <div className="grid grid-cols-2 gap-2 text-[11px] text-[#6B6B65] pb-3 border-b border-[#E6E2D9] mb-3">
                      <div>CPU: {dp.cpu_throttle_rate || 1}x Slowdown</div>
                      <div>RAM: {Math.round((dp.ram_mb || 4096) / 1024)}GB</div>
                      <div className="truncate">Network: {dp.network_profile || "Custom"}</div>
                      <div>Failures: {run.failures?.length || 0} issues</div>
                    </div>

                    {/* Vitals summary */}
                    <div className="grid grid-cols-3 gap-2 text-center text-xs">
                      <div className="p-2 bg-[#FAF9F5] rounded border border-[#E6E2D9]">
                        <span className="text-[10px] text-[#96948D] block">LCP</span>
                        <span className="font-semibold text-[#252525]">
                          {mDict["LCP"] ? `${mDict["LCP"]}ms` : "N/A"}
                        </span>
                      </div>
                      <div className="p-2 bg-[#FAF9F5] rounded border border-[#E6E2D9]">
                        <span className="text-[10px] text-[#96948D] block">FCP</span>
                        <span className="font-semibold text-[#252525]">
                          {mDict["FCP"] ? `${mDict["FCP"]}ms` : "N/A"}
                        </span>
                      </div>
                      <div className="p-2 bg-[#FAF9F5] rounded border border-[#E6E2D9]">
                        <span className="text-[10px] text-[#96948D] block">CLS</span>
                        <span className="font-semibold text-[#252525]">
                          {mDict["CLS"] !== undefined ? mDict["CLS"] : "N/A"}
                        </span>
                      </div>
                    </div>

                    {/* Action footer */}
                    <div className="mt-3 pt-3 border-t border-[#E6E2D9] flex items-center justify-between text-xs text-[#D97745]">
                      <span className="font-medium">Inspect Device Details</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Selected Device Deep-Dive & Screenshot Inspection */}
          {selectedDeviceIndex !== null && runs[selectedDeviceIndex] && (
            <div className="bg-white border border-[#E6E2D9] rounded-xl p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-[#E6E2D9]">
                <div className="flex items-center gap-2.5">
                  <span className="w-8 h-8 rounded-lg bg-[#F8E9DF] text-[#D97745] flex items-center justify-center font-bold">
                    <Smartphone className="w-4 h-4" />
                  </span>
                  <div>
                    <h3 className="text-sm font-semibold text-[#252525]">
                      Selected Profile: {runs[selectedDeviceIndex].device_profile?.name}
                    </h3>
                    <p className="text-xs text-[#6B6B65]">
                      Run ID: {runs[selectedDeviceIndex].id}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowEvidenceModal(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-[#FAF9F5] hover:bg-[#EEECE5] border border-[#E6E2D9] text-[#252525] text-xs font-semibold rounded-lg transition-colors"
                  >
                    <Eye className="w-3.5 h-3.5 text-[#D97745]" />
                    <span>View Visual Evidence</span>
                  </button>
                  {onOpenAuditReport && (
                    <button
                      onClick={() =>
                        onOpenAuditReport(
                          comparisonData.comparison_group_id,
                          runs[selectedDeviceIndex].id,
                          comparisonData
                        )
                      }
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-[#D97745] hover:bg-[#B95E32] text-white text-xs font-semibold rounded-lg transition-colors shadow-xs"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>Generate Audit Report</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Health Score Breakdown for this specific device */}
              <HealthScoreCard
                metrics={runs[selectedDeviceIndex].metrics || []}
                failures={runs[selectedDeviceIndex].failures || []}
                deviceName={runs[selectedDeviceIndex].device_profile?.name}
                targetUrl={targetUrl}
              />
            </div>
          )}
        </div>
      )}

      {/* Visual Evidence Lightbox Modal */}
      {showEvidenceModal && selectedDeviceIndex !== null && runs[selectedDeviceIndex] && (
        <VisualEvidenceViewer
          isOpen={showEvidenceModal}
          onClose={() => setShowEvidenceModal(false)}
          failures={runs[selectedDeviceIndex].failures || []}
          defaultScreenshotUrl={runs[selectedDeviceIndex].screenshot_url}
          deviceName={runs[selectedDeviceIndex].device_profile?.name}
          targetUrl={targetUrl}
        />
      )}
    </div>
  );
}
