"use client";

import React, { useLayoutEffect, useRef } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Activity, AlertOctagon, BookOpen, Brain, CheckCircle2, Database, FileText,
  GitCompare, Globe, Layers, Menu, Radio, RefreshCw, Settings, Sliders, Smartphone, X,
} from "lucide-react";
import { Button, Pill } from "./ui";

export type TabId =
  | "overview" | "web_test" | "device_builder" | "android_test" | "device_lab"
  | "compare" | "failures" | "rca" | "graph" | "reports" | "settings" | "docs";

type NavItem = { id: TabId; label: string; icon: LucideIcon };
type NavGroup = { title: string; items: NavItem[] };

const NAV: NavGroup[] = [
  {
    title: "Simulation & Testing",
    items: [
      { id: "overview", label: "Main Dashboard", icon: Activity },
      { id: "web_test", label: "Website Testing", icon: Globe },
      { id: "device_builder", label: "Device Config Builder", icon: Sliders },
      { id: "android_test", label: "Android APK Testing", icon: Smartphone },
      { id: "device_lab", label: "Device Lab & Tiers", icon: Radio },
    ],
  },
  {
    title: "Comparison & Analysis",
    items: [
      { id: "compare", label: "Device Comparison", icon: GitCompare },
      { id: "failures", label: "Failure Explorer", icon: AlertOctagon },
      { id: "rca", label: "Root Cause Analysis", icon: Brain },
      { id: "graph", label: "Intelligence Graph", icon: Database },
    ],
  },
  {
    title: "Governance & Runbooks",
    items: [
      { id: "reports", label: "Audit Reports", icon: FileText },
      { id: "settings", label: "Settings", icon: Settings },
      { id: "docs", label: "Documentation", icon: BookOpen },
    ],
  },
];

export interface ServiceStatus {
  label: string;
  ok: boolean;
  okText?: string;
  offText?: string;
}

interface AppShellProps {
  active: TabId;
  onNavigate: (tab: TabId) => void;
  mobileOpen: boolean;
  onMobileOpenChange: (open: boolean) => void;
  services?: ServiceStatus[];
  onRefresh?: () => void;
  error?: string | null;
  onDismissError?: () => void;
  children: React.ReactNode;
}

export default function AppShell({
  active,
  onNavigate,
  mobileOpen,
  onMobileOpenChange,
  services = [],
  onRefresh,
  error,
  onDismissError,
  children,
}: AppShellProps) {
  const navRef = useRef<HTMLElement>(null);
  const indicatorRef = useRef<HTMLDivElement>(null);

  // Slide the dark highlight to the active item
  useLayoutEffect(() => {
    const nav = navRef.current;
    const ind = indicatorRef.current;
    if (!nav || !ind) return;
    const el = nav.querySelector<HTMLButtonElement>(`[data-nav-id="${active}"]`);
    if (!el) {
      ind.style.opacity = "0";
      return;
    }
    ind.style.opacity = "1";
    ind.style.transform = `translateY(${el.offsetTop}px)`;
    ind.style.height = `${el.offsetHeight}px`;
  }, [active, mobileOpen]);

  return (
    <div className="flex h-screen overflow-hidden bg-paper font-sans text-ink">
      {/* Mobile backdrop */}
      <div
        onClick={() => onMobileOpenChange(false)}
        className={`fixed inset-0 z-40 bg-ink/25 backdrop-blur-[2px] transition-opacity duration-300 lg:hidden ${
          mobileOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-ink/10 bg-paper transition-transform duration-300 ease-out lg:static lg:w-64 lg:translate-x-0 ${
          mobileOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-5 py-5">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-ink text-paper transition-transform duration-500 hover:rotate-[15deg]">
              <Layers className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 font-display text-[15px] font-semibold tracking-tight">
                TierLens <Pill tone="indigo" mono>v2.0</Pill>
              </div>
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink/50">Device testing</p>
            </div>
          </div>
          <button
            onClick={() => onMobileOpenChange(false)}
            className="rounded-lg p-1.5 text-ink/50 transition hover:bg-ink/5 hover:text-ink lg:hidden"
            aria-label="Close navigation"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav ref={navRef} className="relative flex-1 space-y-5 overflow-y-auto px-3 pb-4">
          <div
            ref={indicatorRef}
            aria-hidden
            className="nav-indicator pointer-events-none absolute left-3 right-3 top-0 rounded-xl bg-ink opacity-0"
          />
          {NAV.map((group) => (
            <div key={group.title}>
              <div className="px-3 pb-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-ink/40">
                {group.title}
              </div>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const isActive = item.id === active;
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      data-nav-id={item.id}
                      onClick={() => onNavigate(item.id)}
                      aria-current={isActive ? "page" : undefined}
                      className={`group relative z-10 flex w-full items-center gap-3 rounded-xl px-3 py-2 text-[13px] transition-colors duration-200 ${
                        isActive ? "font-semibold text-paper" : "text-ink/65 hover:text-ink"
                      }`}
                    >
                      <Icon
                        className={`h-4 w-4 shrink-0 transition-transform duration-300 group-hover:scale-110 ${
                          isActive ? "text-signal" : "text-ink/45"
                        }`}
                      />
                      <span className="flex-1 text-left">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="m-3 rounded-xl border border-ink/10 bg-white/60 p-3">
          <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.12em] text-ink/70">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-signal opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-signal" />
            </span>
            Real Data Policy: Strict
          </div>
          <p className="mt-1.5 text-[10px] leading-snug text-ink/50">
            Zero fabricated results. Browser tests run via real Playwright and CDP.
          </p>
        </div>
      </aside>

      {/* Main */}
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between gap-3 border-b border-ink/10 bg-paper/80 px-3 backdrop-blur-xl sm:px-6">
          <div className="flex min-w-0 items-center gap-2 overflow-x-auto">
            <button
              onClick={() => onMobileOpenChange(!mobileOpen)}
              className="shrink-0 rounded-lg p-1.5 text-ink/70 transition hover:bg-ink/5 lg:hidden"
              aria-label="Toggle navigation menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            {services.map((s) => (
              <Pill key={s.label} tone={s.ok ? "green" : "slate"} dot>
                {s.label}: {s.ok ? s.okText ?? "Online" : s.offText ?? "Offline"}
              </Pill>
            ))}
          </div>
          {onRefresh && (
            <Button variant="secondary" size="sm" icon={RefreshCw} onClick={onRefresh} className="shrink-0">
              Refresh
            </Button>
          )}
        </header>

        {error && (
          <div
            role="alert"
            className="animate-fade-up flex items-center justify-between gap-3 border-b border-red-200 bg-red-50 px-4 py-2.5 text-xs text-red-800 sm:px-6"
          >
            <div className="flex items-center gap-2">
              <AlertOctagon className="h-4 w-4 shrink-0 text-red-600" />
              <span>{error}</span>
            </div>
            {onDismissError && (
              <button
                onClick={onDismissError}
                className="rounded p-0.5 text-red-600 transition hover:bg-red-100"
                aria-label="Dismiss"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {/* Keyed on the active tab so each page change replays the entrance animation */}
          <div key={active} className="animate-fade-up mx-auto max-w-7xl space-y-6 p-3 sm:p-6">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
