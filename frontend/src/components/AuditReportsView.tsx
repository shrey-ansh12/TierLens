"use client";

import React, { useState, useEffect } from "react";
import {
  FileText,
  Search,
  Filter,
  RefreshCw,
  Printer,
  Eye,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Globe,
  ExternalLink,
  ChevronRight,
  ShieldCheck
} from "lucide-react";
import { ApiClient } from "@/lib/api";
import AuditReportModal from "./AuditReportModal";
import HealthScoreCard, { calculateWebsiteHealthScore } from "./HealthScoreCard";

interface AuditReportsViewProps {
  onSelectRunForReport?: (runData: any) => void;
}

export default function AuditReportsView({ onSelectRunForReport }: AuditReportsViewProps) {
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedReport, setSelectedReport] = useState<any | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const fetchReports = async () => {
    setLoading(true);
    try {
      // First try dedicated audit reports endpoint with real measured vitals
      let rawRuns: any[] = [];
      try {
        const auditRes = await ApiClient.getAuditReports({ limit: 50 });
        if (Array.isArray(auditRes) && auditRes.length > 0) {
          rawRuns = auditRes;
        }
      } catch (e) {
        console.warn("Audit reports endpoint fallback:", e);
      }

      if (rawRuns.length === 0) {
        const histRes = await ApiClient.getHistoricalRuns({ limit: 50 });
        rawRuns = Array.isArray(histRes) ? histRes : (histRes?.runs || []);
      }

      // Filter STRICTLY for actual live runs that have measured Web Vitals
      const actualRuns = rawRuns.filter((r: any) => {
        const hasMetrics = (Array.isArray(r.metrics) && r.metrics.length > 0) || (r.metric_count && r.metric_count > 0);
        return hasMetrics;
      });

      const normalized = actualRuns.map((r: any) => {
        const metricsList = Array.isArray(r.metrics)
          ? r.metrics
          : Object.entries(r.metrics || {}).map(([name, val]) => ({ name, value: val }));

        const mDict: Record<string, any> = {};
        metricsList.forEach((m: any) => {
          mDict[m.name] = m.value;
        });

        return {
          ...r,
          id: r.id || r.run_id,
          target_url: r.target_url || r.project_name || "https://app.local",
          device_profile_name: r.device_profile_name || r.device_profile?.name || "Target Profile",
          metrics: metricsList,
          lcp: mDict["LCP"] !== undefined ? mDict["LCP"] : r.lcp,
          fcp: mDict["FCP"] !== undefined ? mDict["FCP"] : r.fcp,
          cls: mDict["CLS"] !== undefined ? mDict["CLS"] : r.cls,
          ttfb: mDict["TTFB"] !== undefined ? mDict["TTFB"] : r.ttfb,
          failures: r.failures || [],
          failure_count: r.failure_count ?? (r.failures?.length || 0),
          recommendations: r.recommendations || []
        };
      });

      setReports(normalized);
    } catch (err) {
      console.error("Failed to load historical audit reports:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
  }, []);

  const filteredReports = reports.filter((r) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const url = (r.target_url || "").toLowerCase();
    const proj = (r.project_name || "").toLowerCase();
    const id = (r.id || "").toLowerCase();
    return url.includes(q) || proj.includes(q) || id.includes(q);
  });

  const handleOpenReport = (report: any) => {
    setSelectedReport(report);
    setIsModalOpen(true);
    if (onSelectRunForReport) {
      onSelectRunForReport(report);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white border border-[#E6E2D9] rounded-xl p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-[#F8E9DF] text-[#D97745] flex items-center justify-center font-bold">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-[#252525]">Audit Reports</h2>
            <p className="text-xs text-[#6B6B65]">
              Browse, inspect, and export comprehensive performance audit reports generated from live website tests
            </p>
          </div>
        </div>

        <button
          onClick={fetchReports}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-2 bg-[#FAF9F5] hover:bg-[#EEECE5] border border-[#E6E2D9] text-[#252525] text-xs font-semibold rounded-lg transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          <span>Refresh Reports</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white border border-[#E6E2D9] rounded-xl p-4 shadow-xs flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-[#96948D] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search reports by URL, Project, or Run ID..."
            className="w-full pl-9 pr-3 py-2 text-xs bg-[#FAF9F5] border border-[#E6E2D9] rounded-lg text-[#252525] focus:outline-hidden focus:border-[#D97745]"
          />
        </div>
        <span className="text-xs text-[#6B6B65] shrink-0 font-medium">
          {filteredReports.length} report(s) found
        </span>
      </div>

      {/* Reports Grid */}
      {loading ? (
        <div className="p-12 text-center text-[#6B6B65] text-xs bg-white rounded-xl border border-[#E6E2D9]">
          <RefreshCw className="w-6 h-6 text-[#D97745] animate-spin mx-auto mb-2" />
          <span>Loading audit reports from Neon PostgreSQL & Neo4j Aura...</span>
        </div>
      ) : filteredReports.length === 0 ? (
        <div className="p-12 text-center text-[#6B6B65] text-xs bg-white rounded-xl border border-[#E6E2D9]">
          <FileText className="w-8 h-8 text-[#96948D] mx-auto mb-2" />
          <p className="font-semibold text-sm text-[#252525]">No audit reports found</p>
          <p className="text-xs text-[#96948D] mt-1">
            Run a test in Website Testing or Live Testing Arena to generate your first audit report.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredReports.map((report) => {
            const isCompleted = report.status === "COMPLETED" || report.status === "COMPLETED_WITH_WARNINGS";
            const health = calculateWebsiteHealthScore(report.metrics || [], report.failures || []);

            return (
              <div
                key={report.id}
                className="bg-white border border-[#E6E2D9] rounded-xl p-5 shadow-xs hover:border-[#D97745]/60 hover:shadow-sm transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between pb-3 border-b border-[#E6E2D9] mb-3">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[#FAF9F5] border border-[#E6E2D9] text-[#6B6B65] truncate max-w-[140px]">
                      {report.device_profile_name || "Device Profile"}
                    </span>
                    <span
                      className="text-xs font-bold px-2 py-0.5 rounded-full"
                      style={{ backgroundColor: health.gradeBg, color: health.gradeColor }}
                    >
                      Score: {health.compositeScore}
                    </span>
                  </div>

                  <h3 className="text-sm font-semibold text-[#252525] truncate">
                    {report.target_url || "Target Website"}
                  </h3>
                  <p className="text-[11px] text-[#96948D] mt-0.5">
                    {report.created_at ? new Date(report.created_at).toLocaleString() : "Recent Run"}
                  </p>

                  {/* Vitals snapshot */}
                  <div className="grid grid-cols-3 gap-2 mt-4 text-center">
                    <div className="p-2 bg-[#FAF9F5] rounded border border-[#E6E2D9]">
                      <span className="text-[9px] uppercase font-semibold text-[#96948D] block">LCP</span>
                      <span className="text-xs font-bold text-[#252525]">
                        {report.lcp !== undefined && report.lcp !== null
                          ? typeof report.lcp === "number"
                            ? `${report.lcp.toLocaleString()}ms`
                            : `${report.lcp}ms`
                          : "—"}
                      </span>
                    </div>
                    <div className="p-2 bg-[#FAF9F5] rounded border border-[#E6E2D9]">
                      <span className="text-[9px] uppercase font-semibold text-[#96948D] block">FCP</span>
                      <span className="text-xs font-bold text-[#252525]">
                        {report.fcp !== undefined && report.fcp !== null
                          ? typeof report.fcp === "number"
                            ? `${report.fcp.toLocaleString()}ms`
                            : `${report.fcp}ms`
                          : "—"}
                      </span>
                    </div>
                    <div className="p-2 bg-[#FAF9F5] rounded border border-[#E6E2D9]">
                      <span className="text-[9px] uppercase font-semibold text-[#96948D] block">Failures</span>
                      <span className={`text-xs font-bold ${report.failure_count > 0 ? "text-[#C6534B]" : "text-[#36865A]"}`}>
                        {report.failure_count || 0}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-[#E6E2D9] flex items-center justify-between">
                  <span className="text-[11px] text-[#6B6B65]">
                    {report.duration_ms ? `${Math.round(report.duration_ms / 1000)}s test duration` : "Full audit"}
                  </span>
                  <button
                    onClick={() => handleOpenReport(report)}
                    className="flex items-center gap-1 text-xs font-semibold text-[#D97745] hover:text-[#B95E32] transition-colors"
                  >
                    <span>Inspect Report</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Audit Report Modal */}
      {isModalOpen && selectedReport && (
        <AuditReportModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          reportData={selectedReport}
          historicalRuns={reports}
        />
      )}
    </div>
  );
}
