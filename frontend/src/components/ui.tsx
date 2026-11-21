"use client";

import React, { useEffect, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { Check, Loader2 } from "lucide-react";

/* ---------- Tones ---------- */
export type Tone = "blue" | "green" | "amber" | "red" | "purple" | "slate" | "indigo";

export const TONE: Record<Tone, { pill: string; dot: string; hex: string }> = {
  blue:   { pill: "bg-blue-50 text-blue-700 ring-blue-200",          dot: "bg-blue-500",    hex: "#2563EB" },
  green:  { pill: "bg-emerald-50 text-emerald-700 ring-emerald-200", dot: "bg-emerald-500", hex: "#10B981" },
  amber:  { pill: "bg-amber-50 text-amber-700 ring-amber-200",       dot: "bg-amber-500",   hex: "#F59E0B" },
  red:    { pill: "bg-rose-50 text-rose-700 ring-rose-200",          dot: "bg-rose-500",    hex: "#E11D48" },
  purple: { pill: "bg-violet-50 text-violet-700 ring-violet-200",    dot: "bg-violet-500",  hex: "#8B5CF6" },
  slate:  { pill: "bg-ink/5 text-ink/60 ring-ink/10",                dot: "bg-ink/30",      hex: "#94A3B8" },
  indigo: { pill: "bg-signal/10 text-signal ring-signal/25",         dot: "bg-signal",      hex: "#FF5A1F" },
};

/* ---------- Scroll reveal ---------- */
export function useInView<T extends HTMLElement>(threshold = 0.15) {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          io.disconnect();
        }
      },
      { threshold }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);

  return { ref, inView };
}

export function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const { ref, inView } = useInView<HTMLDivElement>();
  return (
    <div
      ref={ref}
      className={`reveal ${inView ? "is-visible" : ""} ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

/* ---------- Animated number ---------- */
export function CountUp({
  value,
  decimals = 0,
  duration = 900,
  suffix = "",
}: {
  value: number;
  decimals?: number;
  duration?: number;
  suffix?: string;
}) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setDisplay(value);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(value * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  return <>{display.toFixed(decimals)}{suffix}</>;
}

/* ---------- Primitives ---------- */
export function Card({
  children,
  className = "",
  interactive = false,
  onClick,
}: {
  children: React.ReactNode;
  className?: string;
  interactive?: boolean;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`rounded-2xl border border-ink/10 bg-white shadow-sm transition-all duration-300 ease-out ${
        interactive ? "cursor-pointer hover:-translate-y-0.5 hover:border-ink/25 hover:shadow-xl" : ""
      } ${className}`}
    >
      {children}
    </div>
  );
}

export function Pill({
  tone = "slate",
  children,
  dot = false,
  mono = false,
  className = "",
}: {
  tone?: Tone;
  children: React.ReactNode;
  dot?: boolean;
  mono?: boolean;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${
        TONE[tone].pill
      } ${mono ? "font-mono" : ""} ${className}`}
    >
      {dot && <span className={`h-1.5 w-1.5 rounded-full ${TONE[tone].dot}`} />}
      {children}
    </span>
  );
}

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
  loading?: boolean;
  icon?: LucideIcon;
};

const BUTTON_VARIANTS = {
  primary: "bg-ink text-paper hover:bg-signal",
  secondary: "border border-ink/15 bg-white text-ink hover:border-ink/30 hover:bg-ink/[0.02]",
  ghost: "text-ink/70 hover:bg-ink/5 hover:text-ink",
  danger: "bg-red-600 text-white hover:bg-red-500",
};

export function Button({
  variant = "primary",
  size = "md",
  loading,
  icon: Icon,
  className = "",
  children,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-all duration-300 ease-out active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 ${
        size === "sm" ? "h-8 px-3.5 text-xs" : "h-10 px-5 text-sm"
      } ${BUTTON_VARIANTS[variant]} ${className}`}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : Icon ? (
        <Icon className="h-4 w-4" />
      ) : null}
      {children}
    </button>
  );
}

export const inputClass =
  "w-full rounded-xl border border-ink/15 bg-white px-3.5 py-2.5 text-sm text-ink placeholder:text-ink/35 shadow-sm transition duration-200 focus:border-ink focus:outline-none focus:ring-4 focus:ring-signal/15";

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink/60">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-ink/50">{hint}</span>}
    </label>
  );
}

export function ChoiceCard({
  selected,
  onClick,
  title,
  description,
}: {
  selected: boolean;
  onClick: () => void;
  title: string;
  description: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`w-full rounded-xl border p-4 text-left transition-all duration-300 ease-out hover:-translate-y-0.5 hover:shadow-md ${
        selected ? "border-ink bg-white ring-4 ring-signal/15" : "border-ink/10 bg-white hover:border-ink/25"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="text-sm font-semibold text-ink">{title}</div>
          <p className="text-xs text-ink/55">{description}</p>
        </div>
        <span
          className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border transition-all duration-300 ${
            selected ? "scale-100 border-signal bg-signal text-white" : "scale-90 border-ink/20 text-transparent"
          }`}
        >
          <Check className="h-3 w-3" strokeWidth={3} />
        </span>
      </div>
    </button>
  );
}

/* ---------- Metrics ---------- */
export function MetricBar({
  label,
  value,
  max,
  unit = "",
  tone = "indigo",
  delay = 0,
}: {
  label: string;
  value: number;
  max: number;
  unit?: string;
  tone?: Tone;
  delay?: number;
}) {
  const { ref, inView } = useInView<HTMLDivElement>(0.3);
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div ref={ref} className="space-y-1.5">
      <div className="flex justify-between text-xs">
        <span className="text-ink/65">{label}</span>
        <span className="font-mono font-semibold text-ink tabular-nums">
          {value}
          {unit}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-ink/10">
        <div
          className="h-full rounded-full transition-[width] duration-1000 ease-out"
          style={{
            width: inView ? `${pct}%` : "0%",
            background: TONE[tone].hex,
            transitionDelay: `${delay}ms`,
          }}
        />
      </div>
    </div>
  );
}

export function IndeterminateBar({ active = true }: { active?: boolean }) {
  if (!active) return null;
  return (
    <div className="relative h-1 overflow-hidden rounded-full bg-ink/10">
      <div className="animate-indeterminate absolute inset-y-0 left-0 w-1/3 rounded-full bg-signal" />
    </div>
  );
}

export function Skeleton({ className = "h-4 w-full" }: { className?: string }) {
  return <div className={`shimmer rounded-md bg-ink/[0.06] ${className}`} />;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <Reveal className="grid place-items-center gap-3 py-12 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-2xl bg-signal/10 text-signal">
        <Icon className="h-6 w-6" />
      </div>
      <div className="font-display text-base font-semibold text-ink">{title}</div>
      {description && <p className="max-w-sm text-xs text-ink/55">{description}</p>}
      {action}
    </Reveal>
  );
}
