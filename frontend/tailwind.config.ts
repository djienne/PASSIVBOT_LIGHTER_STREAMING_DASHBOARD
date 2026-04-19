import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Broadcast-friendly dark palette.
        bg:        "#05070d",
        panel:     "#0b101a",
        panel2:    "#111827",
        border:    "#1e2638",
        text:      "#e6edf7",
        subtle:    "#8794ae",
        dim:       "#4a5570",
        bull:      "#34d399",
        bullStrong: "#10b981",
        bear:      "#f87171",
        bearStrong: "#ef4444",
        neutral:   "#64748b",
        accent:    "#60a5fa",
        accent2:   "#a78bfa",
        warn:      "#fbbf24",
      },
      fontFamily: {
        display: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono:    ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      boxShadow: {
        pane: "0 1px 0 0 rgba(255,255,255,0.03) inset, 0 8px 24px -12px rgba(0,0,0,0.6)",
        glow: "0 0 24px 0 rgba(52,211,153,0.35)",
        glowLoss: "0 0 24px 0 rgba(248,113,113,0.35)",
      },
      animation: {
        "pulse-fast": "pulse 1s ease-in-out 3",
      },
    },
  },
  plugins: [],
} satisfies Config;
