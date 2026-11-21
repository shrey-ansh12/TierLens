import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        paper: "#F3F2EE",
        ink: "#0B0B0C",
        signal: "#FF5A1F",
        background: "#F8FAFC",
        foreground: "#0F172A",
        primary: { DEFAULT: "#2563EB", foreground: "#FFFFFF", hover: "#1D4ED8" },
        secondary: { DEFAULT: "#0284C7", foreground: "#FFFFFF", hover: "#0369A1" },
        muted: { DEFAULT: "#F1F5F9", foreground: "#64748B" },
        destructive: { DEFAULT: "#DC2626", foreground: "#FFFFFF" },
        success: { DEFAULT: "#16A34A", foreground: "#FFFFFF" },
        warning: { DEFAULT: "#D97706", foreground: "#FFFFFF" },
      },
      fontFamily: {
        display: ["var(--font-display)", "Inter", "system-ui", "sans-serif"],
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        mono: ["var(--font-jetbrains)", "monospace"],
      },
      borderRadius: {
        lg: "0.5rem",
        md: "calc(0.5rem - 2px)",
        sm: "calc(0.5rem - 4px)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
