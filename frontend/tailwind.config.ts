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
        warm: {
          bg: "#F5F3EE",
          surface: "#FFFFFF",
          secondary: "#EEECE5",
          sidebar: "#F0EEE8",
          border: "#E6E2D9",
          hover: "#EAE7DF",
          text: "#252525",
          muted: "#6B6B65",
          subtle: "#96948D",
        },
        terracotta: {
          DEFAULT: "#D97745",
          dark: "#B95E32",
          light: "#F8E9DF",
          subtle: "#FCF4EE",
        },
        status: {
          success: "#36865A",
          "success-bg": "#EBF5F0",
          warning: "#C58A35",
          "warning-bg": "#FBF4E8",
          error: "#C6534B",
          "error-bg": "#FBEBEA",
          info: "#557DAA",
          "info-bg": "#EDF3F9",
        },
        // Backwards compatibility mappings for smooth migration
        background: "#F5F3EE",
        foreground: "#252525",
        card: {
          DEFAULT: "#FFFFFF",
          foreground: "#252525",
          border: "#E6E2D9",
        },
        primary: {
          DEFAULT: "#D97745", // Warm Terracotta primary
          foreground: "#FFFFFF",
          hover: "#B95E32",
        },
        border: "#E6E2D9",
        input: "#E6E2D9",
        ring: "#D97745",
      },
      borderRadius: {
        lg: "0.625rem", // 10px
        xl: "0.75rem",  // 12px
        "2xl": "0.875rem", // 14px
      },
      fontFamily: {
        sans: ["Inter", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto", "sans-serif"],
        mono: ["JetBrains Mono", "SFMono-Regular", "Menlo", "Monaco", "Consolas", "monospace"],
      },
      boxShadow: {
        warm: "0 1px 3px 0 rgba(37, 37, 37, 0.04), 0 1px 2px -1px rgba(37, 37, 37, 0.02)",
        "warm-md": "0 4px 6px -1px rgba(37, 37, 37, 0.05), 0 2px 4px -2px rgba(37, 37, 37, 0.03)",
        "warm-lg": "0 10px 15px -3px rgba(37, 37, 37, 0.06), 0 4px 6px -4px rgba(37, 37, 37, 0.03)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
