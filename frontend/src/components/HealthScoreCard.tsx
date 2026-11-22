"use client";

import React, { useState } from "react";
import {
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  AlertOctagon,
  Info,
  ChevronDown,
  ChevronUp,
  HelpCircle,
  TrendingUp,
  Zap,
  Sparkles
} from "lucide-react";

export interface HealthScoreBreakdown {
  compositeScore: number;
  grade: "Excellent" | "Good" | "Needs Improvement" | "Poor";
  gradeColor: string;
  gradeBg: string;
  lcpScore: number;
  fcpScore: number;
  clsScore: number;
  ttfbScore: number;
  failureScore: number;
  positiveIndicators: string[];
  criticalWarnings: string[];
  improvementSuggestions: string[];
}

export function calculateWebsiteHealthScore(
  metrics: Array<{ name: string; value: number | string }> | Record<string, number | string>,
  failures: Array<{ failure_type?: string; severity?: string; title?: string }> = []
): HealthScoreBreakdown {
  const metricMap: Record<string, number> = {};

  if (Array.isArray(metrics)) {
    metrics.forEach((m) => {
      const val = typeof m.value === "number" ? m.value : parseFloat(String(m.value));
      if (!isNaN(val)) {
        metricMap[m.name.toUpperCase()] = val;
      }
    });
  } else if (metrics && typeof metrics === "object") {
    Object.entries(metrics).forEach(([k, v]) => {
      const val = typeof v === "number" ? v : parseFloat(String(v));
      if (!isNaN(val)) {
        metricMap[k.toUpperCase()] = val;
      }
    });
  }

  const hasMetrics = Object.keys(metricMap).length > 0;
  const lcp = metricMap["LCP"];
  const fcp = metricMap["FCP"];
  const cls = metricMap["CLS"];
  const ttfb = metricMap["TTFB"];
  const pageLoad = metricMap["PAGE_LOAD_TIME"];

  // 1. LCP Score (Weight 30%) - Good <= 2500ms, Poor > 4000ms
  let lcpScore = hasMetrics ? 50 : 0;
  if (lcp !== undefined) {
    if (lcp <= 2500) {
      lcpScore = 100;
    } else if (lcp <= 4000) {
      lcpScore = Math.max(50, Math.round(100 - ((lcp - 2500) / 1500) * 50));
    } else {
      lcpScore = Math.max(10, Math.round(50 - ((lcp - 4000) / 4000) * 40));
    }
  }

  // 2. FCP Score (Weight 20%) - Good <= 1800ms, Poor > 3000ms
  let fcpScore = hasMetrics ? 50 : 0;
  if (fcp !== undefined) {
    if (fcp <= 1800) {
      fcpScore = 100;
    } else if (fcp <= 3000) {
      fcpScore = Math.max(50, Math.round(100 - ((fcp - 1800) / 1200) * 50));
    } else {
      fcpScore = Math.max(10, Math.round(50 - ((fcp - 3000) / 3000) * 40));
    }
  }

  // 3. CLS Score (Weight 15%) - Good <= 0.1, Poor > 0.25
  let clsScore = hasMetrics ? 70 : 0;
  if (cls !== undefined) {
    if (cls <= 0.1) {
      clsScore = 100;
    } else if (cls <= 0.25) {
      clsScore = Math.max(50, Math.round(100 - ((cls - 0.1) / 0.15) * 50));
    } else {
      clsScore = Math.max(10, Math.round(50 - ((cls - 0.25) / 0.25) * 40));
    }
  }

  // 4. TTFB Score (Weight 15%) - Good <= 800ms, Poor > 1800ms
  let ttfbScore = hasMetrics ? 70 : 0;
  if (ttfb !== undefined) {
    if (ttfb <= 800) {
      ttfbScore = 100;
    } else if (ttfb <= 1800) {
      ttfbScore = Math.max(50, Math.round(100 - ((ttfb - 800) / 1000) * 50));
    } else {
      ttfbScore = Math.max(10, Math.round(50 - ((ttfb - 1800) / 1800) * 40));
    }
  }

  // 5. Reliability / Failure Penalty (Weight 20%)
  const fatalErrors = failures.filter(
    (f) =>
      f.failure_type === "CRITICAL" ||
      f.failure_type === "NETWORK_ERROR" ||
      f.failure_type === "TARGET_APPLICATION_ERROR" ||
      f.severity === "CRITICAL"
  ).length;
  const warningErrors = failures.length - fatalErrors;
  const failurePenalty = fatalErrors * 35 + warningErrors * 10;
  const failureScore = Math.max(0, 100 - failurePenalty);

  // Weighted composite score
  const compositeScore = !hasMetrics
    ? (failures.length > 0 ? failureScore : 0)
    : Math.round(
        lcpScore * 0.3 +
        fcpScore * 0.2 +
        clsScore * 0.15 +
        ttfbScore * 0.15 +
        failureScore * 0.2
      );

  let grade: "Excellent" | "Good" | "Needs Improvement" | "Poor" = "Good";
  let gradeColor = "#557DAA";
  let gradeBg = "#EEF4FB";

  if (compositeScore >= 90) {
    grade = "Excellent";
    gradeColor = "#36865A";
    gradeBg = "#EAF4EE";
  } else if (compositeScore >= 75) {
    grade = "Good";
    gradeColor = "#557DAA";
    gradeBg = "#EEF4FB";
  } else if (compositeScore >= 50) {
    grade = "Needs Improvement";
    gradeColor = "#C58A35";
    gradeBg = "#FDF6EC";
  } else {
    grade = "Poor";
    gradeColor = "#C6534B";
    gradeBg = "#FCEEEF";
  }

  // Positive indicators
  const positiveIndicators: string[] = [];
  if (ttfb !== undefined && ttfb <= 600) {
    positiveIndicators.push(`Exceptional backend responsiveness (TTFB: ${ttfb}ms)`);
  }
  if (cls !== undefined && cls <= 0.05) {
    positiveIndicators.push(`Rock-solid layout stability with minimal shifting (CLS: ${cls})`);
  }
  if (fcp !== undefined && fcp <= 1500) {
    positiveIndicators.push(`Swift visual paint onset (FCP: ${fcp}ms)`);
  }
  if (failures.length === 0) {
    positiveIndicators.push("Zero fatal script exceptions or failed network subrequests");
  }

  // Critical warnings
  const criticalWarnings: string[] = [];
  if (lcp !== undefined && lcp > 3500) {
    criticalWarnings.push(`Sluggish Largest Contentful Paint (${lcp}ms) causes visible stall on mobile.`);
  }
  if (cls !== undefined && cls > 0.15) {
    criticalWarnings.push(`Significant layout shifts detected (${cls}), degrading reading experience.`);
  }
  if (ttfb !== undefined && ttfb > 1500) {
    criticalWarnings.push(`High Server TTFB (${ttfb}ms) indicates backend or CDN latency.`);
  }
  if (fatalErrors > 0) {
    criticalWarnings.push(`${fatalErrors} critical runtime or network failure(s) intercepted.`);
  }

  // Actionable suggestions
  const improvementSuggestions: string[] = [];
  if (lcp !== undefined && lcp > 2500) {
    improvementSuggestions.push("Preload hero images and critical fonts using <link rel='preload'>.");
  }
  if (cls !== undefined && cls > 0.1) {
    improvementSuggestions.push("Specify explicit width and height attributes on all images and embeds.");
  }
  if (ttfb !== undefined && ttfb > 800) {
    improvementSuggestions.push("Leverage Edge CDN caching and reduce server response processing time.");
  }
  if (failures.length > 0) {
    improvementSuggestions.push("Resolve unresolved subresource fetch errors and uncaught console exceptions.");
  }
  if (improvementSuggestions.length === 0) {
    improvementSuggestions.push("Maintain current asset optimization budgets and monitor regressions continuously.");
  }

  return {
    compositeScore,
    grade,
    gradeColor,
    gradeBg,
    lcpScore,
    fcpScore,
    clsScore,
    ttfbScore,
    failureScore,
    positiveIndicators,
    criticalWarnings,
    improvementSuggestions
  };
}

interface HealthScoreCardProps {
  metrics: Array<{ name: string; value: number | string }>;
  failures?: Array<{ failure_type?: string; severity?: string; title?: string }>;
  targetUrl?: string;
  deviceName?: string;
  className?: string;
  compact?: boolean;
}

export default function HealthScoreCard({
  metrics,
  failures = [],
  targetUrl,
  deviceName,
  className = "",
  compact = false
}: HealthScoreCardProps) {
  const [showFormula, setShowFormula] = useState(false);
  const [isExpanded, setIsExpanded] = useState(!compact);

  const breakdown = calculateWebsiteHealthScore(metrics, failures);

  // SVG Gauge calculations
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (breakdown.compositeScore / 100) * circumference;

  return (
    <div
      className={`bg-white border border-[#E6E2D9] rounded-xl p-5 shadow-xs transition-all ${className}`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-[#E6E2D9]">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center font-bold"
            style={{ backgroundColor: breakdown.gradeBg, color: breakdown.gradeColor }}
          >
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold text-[#252525]">Website Health Score</h3>
              <span
                className="text-xs px-2.5 py-0.5 rounded-full font-medium"
                style={{ backgroundColor: breakdown.gradeBg, color: breakdown.gradeColor }}
              >
                {breakdown.grade}
              </span>
            </div>
            <p className="text-xs text-[#6B6B65]">
              Real-world emulation composite benchmark {deviceName ? `for ${deviceName}` : ""}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFormula(!showFormula)}
            className="text-xs flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-[#E6E2D9] text-[#6B6B65] hover:bg-[#EEECE5] transition-colors"
            title="Inspect documented scoring formula"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span>Formula</span>
          </button>
          {compact && (
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="text-xs flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-[#E6E2D9] text-[#6B6B65] hover:bg-[#EEECE5] transition-colors"
            >
              {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              <span>{isExpanded ? "Less" : "Details"}</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Score & Metric Weights */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 pt-5 items-center">
        {/* Circular Gauge */}
        <div className="md:col-span-4 flex flex-col items-center justify-center py-2">
          <div className="relative w-32 h-32 flex items-center justify-center">
            <svg className="w-32 h-32 transform -rotate-90">
              <circle
                cx="64"
                cy="64"
                r={radius}
                stroke="#EEECE5"
                strokeWidth="10"
                fill="transparent"
              />
              <circle
                cx="64"
                cy="64"
                r={radius}
                stroke={breakdown.gradeColor}
                strokeWidth="10"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                fill="transparent"
                className="transition-all duration-1000 ease-out"
              />
            </svg>
            <div className="absolute flex flex-col items-center justify-center text-center">
              <span className="text-3xl font-bold text-[#252525] tracking-tight">
                {breakdown.compositeScore}
              </span>
              <span className="text-[10px] uppercase font-semibold text-[#6B6B65] tracking-wider">
                out of 100
              </span>
            </div>
          </div>
          <div className="mt-2 text-center">
            <span
              className="text-xs font-semibold px-2 py-0.5 rounded-full"
              style={{ backgroundColor: breakdown.gradeBg, color: breakdown.gradeColor }}
            >
              Rating: {breakdown.grade}
            </span>
          </div>
        </div>

        {/* Breakdown Sub-scores */}
        <div className="md:col-span-8 space-y-3">
          <div>
            <div className="flex justify-between text-xs text-[#252525] font-medium mb-1">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#D97745]"></span>
                Largest Contentful Paint (LCP) <span className="text-[#96948D]">(30% weight)</span>
              </span>
              <span className="font-semibold">{breakdown.lcpScore}/100</span>
            </div>
            <div className="w-full h-2 bg-[#EEECE5] rounded-full overflow-hidden">
              <div
                className="h-full bg-[#D97745] rounded-full transition-all duration-500"
                style={{ width: `${breakdown.lcpScore}%` }}
              />
            </div>
          </div>

          <div>
            <div className="flex justify-between text-xs text-[#252525] font-medium mb-1">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#557DAA]"></span>
                First Contentful Paint (FCP) <span className="text-[#96948D]">(20% weight)</span>
              </span>
              <span className="font-semibold">{breakdown.fcpScore}/100</span>
            </div>
            <div className="w-full h-2 bg-[#EEECE5] rounded-full overflow-hidden">
              <div
                className="h-full bg-[#557DAA] rounded-full transition-all duration-500"
                style={{ width: `${breakdown.fcpScore}%` }}
              />
            </div>
          </div>

          <div>
            <div className="flex justify-between text-xs text-[#252525] font-medium mb-1">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#36865A]"></span>
                Cumulative Layout Shift (CLS) <span className="text-[#96948D]">(15% weight)</span>
              </span>
              <span className="font-semibold">{breakdown.clsScore}/100</span>
            </div>
            <div className="w-full h-2 bg-[#EEECE5] rounded-full overflow-hidden">
              <div
                className="h-full bg-[#36865A] rounded-full transition-all duration-500"
                style={{ width: `${breakdown.clsScore}%` }}
              />
            </div>
          </div>

          <div>
            <div className="flex justify-between text-xs text-[#252525] font-medium mb-1">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#C58A35]"></span>
                Server Response (TTFB) <span className="text-[#96948D]">(15% weight)</span>
              </span>
              <span className="font-semibold">{breakdown.ttfbScore}/100</span>
            </div>
            <div className="w-full h-2 bg-[#EEECE5] rounded-full overflow-hidden">
              <div
                className="h-full bg-[#C58A35] rounded-full transition-all duration-500"
                style={{ width: `${breakdown.ttfbScore}%` }}
              />
            </div>
          </div>

          <div>
            <div className="flex justify-between text-xs text-[#252525] font-medium mb-1">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#8E7DBE]"></span>
                Reliability & Execution Integrity <span className="text-[#96948D]">(20% weight)</span>
              </span>
              <span className="font-semibold">{breakdown.failureScore}/100</span>
            </div>
            <div className="w-full h-2 bg-[#EEECE5] rounded-full overflow-hidden">
              <div
                className="h-full bg-[#8E7DBE] rounded-full transition-all duration-500"
                style={{ width: `${breakdown.failureScore}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Expanded Sections: Indicators, Warnings, Suggestions */}
      {isExpanded && (
        <div className="mt-6 pt-5 border-t border-[#E6E2D9] grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Positive Indicators */}
          <div className="bg-[#FAF9F5] p-3.5 rounded-lg border border-[#E6E2D9]">
            <h4 className="text-xs font-semibold text-[#36865A] flex items-center gap-1.5 mb-2">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Positive Indicators ({breakdown.positiveIndicators.length})
            </h4>
            {breakdown.positiveIndicators.length > 0 ? (
              <ul className="space-y-1.5 text-xs text-[#6B6B65]">
                {breakdown.positiveIndicators.map((pos, idx) => (
                  <li key={idx} className="flex items-start gap-1.5">
                    <span className="text-[#36865A] font-bold">•</span>
                    <span>{pos}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-[#96948D] italic">No standout positive indicators measured.</p>
            )}
          </div>

          {/* Critical Warnings */}
          <div className="bg-[#FAF9F5] p-3.5 rounded-lg border border-[#E6E2D9]">
            <h4 className="text-xs font-semibold text-[#C6534B] flex items-center gap-1.5 mb-2">
              <AlertTriangle className="w-3.5 h-3.5" />
              Critical Issues & Warnings ({breakdown.criticalWarnings.length})
            </h4>
            {breakdown.criticalWarnings.length > 0 ? (
              <ul className="space-y-1.5 text-xs text-[#6B6B65]">
                {breakdown.criticalWarnings.map((warn, idx) => (
                  <li key={idx} className="flex items-start gap-1.5">
                    <span className="text-[#C6534B] font-bold">•</span>
                    <span>{warn}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-[#36865A] italic">Zero critical warnings detected for this configuration.</p>
            )}
          </div>

          {/* Actionable Suggestions */}
          <div className="bg-[#FAF9F5] p-3.5 rounded-lg border border-[#E6E2D9]">
            <h4 className="text-xs font-semibold text-[#D97745] flex items-center gap-1.5 mb-2">
              <Sparkles className="w-3.5 h-3.5" />
              Score Improvement Plan
            </h4>
            <ul className="space-y-1.5 text-xs text-[#6B6B65]">
              {breakdown.improvementSuggestions.map((sug, idx) => (
                <li key={idx} className="flex items-start gap-1.5">
                  <span className="text-[#D97745] font-bold">→</span>
                  <span>{sug}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Formula Transparency Modal */}
      {showFormula && (
        <div className="mt-4 p-4 bg-[#F8E9DF]/30 border border-[#D97745]/30 rounded-lg text-xs text-[#252525] animate-in fade-in">
          <div className="flex items-center justify-between font-semibold text-[#B95E32] mb-2">
            <span className="flex items-center gap-1.5">
              <Info className="w-4 h-4" />
              Documented TierLens Health Score Formula
            </span>
            <button
              onClick={() => setShowFormula(false)}
              className="text-[#96948D] hover:text-[#252525]"
            >
              ✕
            </button>
          </div>
          <p className="text-[#6B6B65] mb-2">
            The TierLens Website Health Score is a deterministic, evidence-based performance index computed directly from actual CDP Playwright measurements under controlled throttling conditions. It is not an official Google Lighthouse score.
          </p>
          <div className="font-mono bg-white p-2.5 rounded border border-[#E6E2D9] text-[11px] space-y-1">
            <div>Score = (0.30 × LCP_Score) + (0.20 × FCP_Score) + (0.15 × CLS_Score) + (0.15 × TTFB_Score) + (0.20 × Reliability_Score)</div>
            <div className="text-[#6B6B65] text-[10px] mt-1">
              • Excellent: 90–100 | Good: 75–89 | Needs Improvement: 50–74 | Poor: 0–49
            </div>
            <div className="text-[#6B6B65] text-[10px]">
              • Reliability Penalty: -35 pts per critical exception/timeout, -10 pts per subresource warning.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
