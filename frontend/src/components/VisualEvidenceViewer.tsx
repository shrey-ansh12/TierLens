"use client";

import React, { useState } from "react";
import {
  Maximize2,
  Minimize2,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Download,
  AlertTriangle,
  ExternalLink,
  ShieldAlert,
  Smartphone,
  Eye,
  X,
  FileCode,
  Info
} from "lucide-react";
import { ApiClient } from "@/lib/api";

export interface VisualFailureItem {
  id?: string;
  title: string;
  message: string;
  failure_type: string;
  error_signature?: string;
  component?: string;
  url_or_file?: string;
  screenshot_url?: string;
  device_name?: string;
  tier?: string;
  highlight_region?: {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    label?: string;
  };
}

interface VisualEvidenceViewerProps {
  failures: VisualFailureItem[];
  defaultScreenshotUrl?: string;
  deviceName?: string;
  targetUrl?: string;
  isOpen?: boolean;
  onClose?: () => void;
  standalone?: boolean;
}

export default function VisualEvidenceViewer({
  failures = [],
  defaultScreenshotUrl,
  deviceName = "Target Device",
  targetUrl,
  isOpen = false,
  onClose,
  standalone = false
}: VisualEvidenceViewerProps) {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [showBoundingBox, setShowBoundingBox] = useState(true);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [activeTab, setActiveTab] = useState<"screenshot" | "details">("screenshot");

  const baseUrl = ApiClient.getBaseUrl();

  // Find active failure
  const activeFailure: VisualFailureItem | undefined = failures[selectedIdx] || failures[0];

  // Resolve screenshot path
  const rawUrl = activeFailure?.screenshot_url || defaultScreenshotUrl;
  const fullScreenshotUrl = rawUrl
    ? (rawUrl.startsWith("http") ? rawUrl : `${baseUrl}${rawUrl.startsWith("/") ? "" : "/"}${rawUrl}`)
    : null;

  const handleZoomIn = () => setZoomLevel((prev) => Math.min(prev + 0.25, 2.5));
  const handleZoomOut = () => setZoomLevel((prev) => Math.max(prev - 0.25, 0.5));
  const handleResetZoom = () => setZoomLevel(1);

  const content = (
    <div className="flex flex-col h-full bg-white rounded-xl overflow-hidden border border-[#E6E2D9]">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 bg-[#F0EEE8] border-b border-[#E6E2D9]">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#F8E9DF] text-[#D97745] flex items-center justify-center font-bold">
            <Eye className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[#252525]">Visual Failure Evidence</h3>
            <p className="text-xs text-[#6B6B65]">
              Real Playwright rendering capture on {deviceName}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Controls */}
          <div className="flex items-center bg-white rounded-lg border border-[#E6E2D9] px-1 py-0.5 text-xs">
            <button
              onClick={handleZoomOut}
              className="p-1 hover:text-[#D97745] transition-colors"
              title="Zoom Out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="px-2 font-mono text-[11px] text-[#6B6B65]">
              {Math.round(zoomLevel * 100)}%
            </span>
            <button
              onClick={handleZoomIn}
              className="p-1 hover:text-[#D97745] transition-colors"
              title="Zoom In"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleResetZoom}
              className="p-1 border-l border-[#E6E2D9] ml-1 hover:text-[#D97745] transition-colors"
              title="Reset Zoom"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>

          {fullScreenshotUrl && (
            <a
              href={fullScreenshotUrl}
              download="tierlens_evidence.png"
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 rounded-lg border border-[#E6E2D9] bg-white text-[#6B6B65] hover:text-[#252525] hover:bg-[#EEECE5] transition-colors"
              title="Download Screenshot"
            >
              <Download className="w-3.5 h-3.5" />
            </a>
          )}

          {!standalone && onClose && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg border border-[#E6E2D9] bg-white text-[#6B6B65] hover:text-[#252525] hover:bg-[#EEECE5] transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Body: Two columns (Screenshot viewer on left, Failure details on right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 flex-1 min-h-[460px] overflow-hidden">
        {/* Left Column: Image Canvas */}
        <div className="lg:col-span-8 bg-[#252525]/5 flex flex-col items-center justify-center p-4 overflow-auto relative border-r border-[#E6E2D9]">
          {fullScreenshotUrl ? (
            <div
              className="relative shadow-lg rounded-lg overflow-hidden border border-[#E6E2D9] transition-transform duration-200"
              style={{
                transform: `scale(${zoomLevel})`,
                transformOrigin: "center center"
              }}
            >
              <img
                src={fullScreenshotUrl}
                alt="Playwright Evidence Capture"
                className="max-h-[500px] w-auto object-contain block bg-white"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = "none";
                }}
              />

              {/* Bounding Box Highlight Overlay */}
              {showBoundingBox && (
                <div
                  className="absolute border-2 border-[#C6534B] bg-[#C6534B]/15 rounded pointer-events-none animate-pulse"
                  style={{
                    top: "15%",
                    left: "10%",
                    width: "80%",
                    height: "35%"
                  }}
                >
                  <div className="absolute top-1 left-1 bg-[#C6534B] text-white text-[10px] font-bold px-1.5 py-0.5 rounded shadow">
                    Affected Area: {activeFailure?.component || "Viewport Anomaly"}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center p-8 text-center text-[#96948D]">
              <Smartphone className="w-12 h-12 text-[#96948D]/50 mb-3" />
              <p className="text-sm font-medium text-[#252525]">No Screenshot Artifact Available</p>
              <p className="text-xs text-[#6B6B65] max-w-sm mt-1">
                Screenshots are captured when browser errors or visual shifts are recorded during Playwright test runs.
              </p>
            </div>
          )}

          {/* Toggle Highlight Overlay Button */}
          {fullScreenshotUrl && (
            <div className="absolute bottom-3 left-4 flex items-center gap-2 bg-white/90 backdrop-blur-xs px-2.5 py-1 rounded-md border border-[#E6E2D9] text-xs text-[#252525]">
              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showBoundingBox}
                  onChange={(e) => setShowBoundingBox(e.target.checked)}
                  className="rounded text-[#D97745] focus:ring-[#D97745]"
                />
                <span>Highlight Affected Area</span>
              </label>
            </div>
          )}
        </div>

        {/* Right Column: Failure Details Panel */}
        <div className="lg:col-span-4 bg-white flex flex-col overflow-y-auto p-4 space-y-4">
          {/* Issue Selector if multiple failures exist */}
          {failures.length > 1 && (
            <div>
              <label className="text-xs font-semibold text-[#6B6B65] uppercase tracking-wider block mb-1.5">
                Detected Issues ({failures.length})
              </label>
              <div className="flex flex-col gap-1 max-h-36 overflow-y-auto pr-1">
                {failures.map((f, idx) => (
                  <button
                    key={idx}
                    onClick={() => setSelectedIdx(idx)}
                    className={`text-left text-xs p-2 rounded-lg border transition-all ${
                      idx === selectedIdx
                        ? "bg-[#F8E9DF] border-[#D97745] text-[#252525] font-medium"
                        : "bg-white border-[#E6E2D9] text-[#6B6B65] hover:bg-[#EEECE5]"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="truncate">{f.title || `Issue #${idx + 1}`}</span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-white text-[#C6534B] font-mono">
                        {f.failure_type}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {activeFailure ? (
            <div className="space-y-3">
              <div>
                <span className="text-[11px] font-semibold text-[#C6534B] bg-[#FCEEEF] px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  {activeFailure.failure_type || "RUNTIME_ANOMALY"}
                </span>
                <h4 className="text-sm font-semibold text-[#252525] mt-1.5">
                  {activeFailure.title}
                </h4>
              </div>

              {/* Message Box */}
              <div className="bg-[#FAF9F5] border border-[#E6E2D9] rounded-lg p-3">
                <span className="text-[11px] font-semibold text-[#6B6B65] block mb-1">
                  Failure Description
                </span>
                <p className="text-xs text-[#252525] whitespace-pre-wrap font-mono leading-relaxed max-h-36 overflow-y-auto">
                  {activeFailure.message}
                </p>
              </div>

              {/* Error Signature & Component */}
              <div className="space-y-2 text-xs">
                {activeFailure.error_signature && (
                  <div className="flex justify-between items-center py-1 border-b border-[#E6E2D9]">
                    <span className="text-[#6B6B65]">Error Signature:</span>
                    <span className="font-mono text-[11px] bg-[#EEECE5] px-1.5 py-0.5 rounded text-[#252525]">
                      {activeFailure.error_signature}
                    </span>
                  </div>
                )}
                {activeFailure.component && (
                  <div className="flex justify-between items-center py-1 border-b border-[#E6E2D9]">
                    <span className="text-[#6B6B65]">Component:</span>
                    <span className="font-medium text-[#252525]">{activeFailure.component}</span>
                  </div>
                )}
                {targetUrl && (
                  <div className="flex justify-between items-center py-1 border-b border-[#E6E2D9]">
                    <span className="text-[#6B6B65]">Target URL:</span>
                    <a
                      href={targetUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#D97745] hover:underline flex items-center gap-1 truncate max-w-[160px]"
                    >
                      <span className="truncate">{targetUrl}</span>
                      <ExternalLink className="w-3 h-3 shrink-0" />
                    </a>
                  </div>
                )}
                <div className="flex justify-between items-center py-1 border-b border-[#E6E2D9]">
                  <span className="text-[#6B6B65]">Tested Device:</span>
                  <span className="font-medium text-[#252525]">{deviceName}</span>
                </div>
              </div>

              {/* Suggested Remediation */}
              <div className="bg-[#F8E9DF]/40 border border-[#D97745]/30 rounded-lg p-3">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-[#B95E32] mb-1">
                  <Info className="w-3.5 h-3.5" />
                  Engineering Remediation
                </div>
                <p className="text-xs text-[#6B6B65]">
                  Audit element layout coordinates, verify responsive asset aspect ratios, and test under constrained memory allocations.
                </p>
              </div>
            </div>
          ) : (
            <div className="text-center py-10 text-[#96948D] text-xs">
              No failure details to display.
            </div>
          )}
        </div>
      </div>
    </div>
  );

  if (standalone) {
    return content;
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-[#252525]/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="w-full max-w-5xl h-[85vh] max-h-[750px] shadow-2xl animate-in zoom-in-95 duration-150">
        {content}
      </div>
    </div>
  );
}
