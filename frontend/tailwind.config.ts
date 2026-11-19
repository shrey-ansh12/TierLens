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
        background: "#080C14",
        foreground: "#F1F5F9",
        card: {
          DEFAULT: "#0F172A",
          foreground: "#F1F5F9",
          border: "#1E293B",
        },
        popover: {
          DEFAULT: "#0F172A",
          foreground: "#F1F5F9",
        },
        primary: {
          DEFAULT: "#06B6D4", // Cyan
          foreground: "#041C24",
          hover: "#0891B2",
        },
        secondary: {
          DEFAULT: "#3B82F6", // Blue
          foreground: "#FFFFFF",
          hover: "#2563EB",
        },
        muted: {
          DEFAULT: "#1E293B",
          foreground: "#94A3B8",
        },
        accent: {
          DEFAULT: "#0284C7",
          foreground: "#F0F9FF",
        },
        destructive: {
          DEFAULT: "#EF4444",
          foreground: "#FFFFFF",
        },
        success: {
          DEFAULT: "#10B981",
          foreground: "#FFFFFF",
        },
        warning: {
          DEFAULT: "#F59E0B",
          foreground: "#FFFFFF",
        },
        border: "#1E293B",
        input: "#1E293B",
        ring: "#06B6D4",
      },
      borderRadius: {
        lg: "0.5rem",
        md: "calc(0.5rem - 2px)",
        sm: "calc(0.5rem - 4px)",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        mono: ["var(--font-jetbrains)", "monospace"],
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
