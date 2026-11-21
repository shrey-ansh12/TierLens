"use client";

import React, { useRef, useState } from "react";
import { CountUp, useInView } from "./ui";

/* Headline that reveals word by word, each word rising out of a mask */
export function LineReveal({
  text,
  as: Tag = "span",
  className = "",
  delay = 0,
}: {
  text: string;
  as?: "h1" | "h2" | "p" | "span";
  className?: string;
  delay?: number;
}) {
  const { ref, inView } = useInView<HTMLElement>(0.2);
  const words = text.split(" ");
  return (
    <Tag ref={ref as any} className={className} aria-label={text}>
      {words.map((w, i) => (
        <span key={i} className="inline-block overflow-hidden align-bottom">
          <span
            className="inline-block transition-transform duration-[900ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
            style={{
              transform: inView ? "translateY(0)" : "translateY(110%)",
              transitionDelay: `${delay + i * 70}ms`,
            }}
          >
            {w}
            {i < words.length - 1 ? "\u00A0" : ""}
          </span>
        </span>
      ))}
    </Tag>
  );
}

/* Infinite ticker; pauses on hover */
export function Marquee({ items, duration = 38 }: { items: string[]; duration?: number }) {
  const row = (key: string) => (
    <div key={key} className="flex shrink-0 items-center gap-10 pr-10">
      {items.map((t) => (
        <span
          key={t}
          className="flex items-center gap-10 font-display text-4xl font-semibold tracking-tight text-ink/80 sm:text-5xl"
        >
          {t}
          <span className="text-signal">✳</span>
        </span>
      ))}
    </div>
  );
  return (
    <div className="group overflow-hidden border-y border-ink/10 py-5">
      <div
        className="flex w-max animate-marquee group-hover:[animation-play-state:paused]"
        style={{ animationDuration: `${duration}s` }}
      >
        {row("a")}
        {row("b")}
      </div>
    </div>
  );
}

/* Button or link that leans toward the cursor */
export function Magnetic({ children, strength = 0.3 }: { children: React.ReactNode; strength?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });

  const onMove = (e: React.MouseEvent) => {
    if (!ref.current) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const r = ref.current.getBoundingClientRect();
    setPos({
      x: (e.clientX - (r.left + r.width / 2)) * strength,
      y: (e.clientY - (r.top + r.height / 2)) * strength,
    });
  };

  return (
    <div
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={() => setPos({ x: 0, y: 0 })}
      className="inline-block transition-transform duration-300 ease-out"
      style={{ transform: `translate3d(${pos.x}px, ${pos.y}px, 0)` }}
    >
      {children}
    </div>
  );
}

/* Card with a light that follows the cursor */
export function Spotlight({
  children,
  className = "",
  onClick,
}: {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!ref.current) return;
    const r = ref.current.getBoundingClientRect();
    ref.current.style.setProperty("--mx", `${e.clientX - r.left}px`);
    ref.current.style.setProperty("--my", `${e.clientY - r.top}px`);
  };
  return (
    <div ref={ref} onMouseMove={onMove} onClick={onClick} className={`spotlight relative overflow-hidden ${className}`}>
      {children}
    </div>
  );
}

/* Stat that counts up the first time it scrolls into view */
export function StatCell({ value, suffix = "", label }: { value: number; suffix?: string; label: string }) {
  const { ref, inView } = useInView<HTMLDivElement>(0.5);
  return (
    <div ref={ref} className="p-6">
      <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-ink/50">{label}</div>
      <div className="mt-3 font-display text-4xl font-semibold tracking-tight text-ink tabular-nums">
        <CountUp value={inView ? value : 0} suffix={suffix} />
      </div>
    </div>
  );
}
