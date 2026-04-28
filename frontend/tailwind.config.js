/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        // ── Paleta Dark Navy Professional ────────────────────────────────
        navy: {
          950: "#0B1120",   // bg principal — Deep Dark Navy
          900: "#151E32",   // cards / painéis
          800: "#1B2640",   // bordas / bg secundário
          700: "#243050",   // hover states
        },
        electric: "#00F0FF",    // Ciano elétrico — ações / destaque primário
        surface: {
          900: "#0B1120",
          800: "#151E32",
          700: "#1B2640",
          600: "#243050",
        },
        // ── Semânticos ────────────────────────────────────────────────────
        "neon-red":    "#FF2A2A",   // mortes / erros / alertas
        "neon-purple": "#7B2CBF",   // gradientes sutis / bordas secundárias
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Fira Code", "Consolas", "monospace"],
      },
      animation: {
        "glow-pulse":  "glow-pulse 2.5s ease-in-out infinite",
        "slide-in":    "slide-in 0.3s ease-out",
        "fade-up":     "fade-up 0.4s ease-out",
      },
      keyframes: {
        "glow-pulse": {
          "0%, 100%": { boxShadow: "0 0 6px rgba(0, 240, 255, 0.25)" },
          "50%":       { boxShadow: "0 0 18px rgba(0, 240, 255, 0.55)" },
        },
        "slide-in": {
          from: { opacity: 0, transform: "translateX(-12px)" },
          to:   { opacity: 1, transform: "translateX(0)" },
        },
        "fade-up": {
          from: { opacity: 0, transform: "translateY(10px)" },
          to:   { opacity: 1, transform: "translateY(0)" },
        },
      },
      boxShadow: {
        "electric-sm": "0 0 8px rgba(0, 240, 255, 0.25)",
        "electric":    "0 0 16px rgba(0, 240, 255, 0.40)",
        "red-sm":      "0 0 8px rgba(255, 42, 42, 0.30)",
        "card":        "0 4px 24px rgba(0, 0, 0, 0.40)",
      },
      // Tailwind's default opacity scale doesn't include 3, 4, 8, 15.
      // These are used as color opacity modifiers (e.g. border-white/8).
      // @apply directives require the value to be in the opacity scale.
      opacity: {
        3:  "0.03",
        4:  "0.04",
        8:  "0.08",
        15: "0.15",
      },
    },
  },
  plugins: [],
};
