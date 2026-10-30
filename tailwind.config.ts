import type { Config } from "tailwindcss";

/**
 * LookAhead — editorial art-direction tokens.
 *
 * Two layers live here on purpose:
 *  1. A semantic palette (paper / ink / periwinkle / sky / lavender / coral …)
 *     used by the redesigned screens and the illustration system.
 *  2. Legacy aliases (ivory, cream, sage, teal, warmgray, line …) remapped ONTO
 *     that palette, so the existing components adopt the new identity without a
 *     risky mass-rename. The aliases are purely presentational — no logic keys
 *     off a colour name.
 *
 * Colour is never the only carrier of meaning: selected/active states also use a
 * mark, weight, or border change (accessibility brief §4, §8).
 */
const config: Config = {
  content: ["./src/app/**/*.{ts,tsx}", "./src/components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        /* ── Semantic palette ───────────────────────────────────────────── */
        paper: "#F6F5F2", // warm off-white reading background
        surface: "#FFFFFF", // card / raised surface
        ink: {
          DEFAULT: "#20243A", // deep midnight navy — primary anchor
          soft: "#2C3151", // raised dark surface
          faint: "#3A3F63" // dark hairline / secondary on ink
        },
        periwinkle: {
          DEFAULT: "#7774E8", // distinctive accent
          deep: "#4B47C9", // primary actions + selected (AA with white)
          soft: "#B9C5F5", // secondary accent / fills
          tint: "#EEEDFB" // very light accent wash
        },
        sky: "#B9C5F5", // restrained cool secondary
        lavender: {
          DEFAULT: "#F0E7F4", // soft highlight wash
          soft: "#C3B4E8", // light lavender accent
          mid: "#7E6AB2", // hover for primary actions
          deep: "#6E5A9E" // primary actions (AA with white text)
        },
        coral: "#E8836B", // warm secondary — used sparingly
        body: "#292B37", // main text
        subtle: "#5F6270", // muted text — darkened from #717381 so small labels clear WCAG AA (≥4.5:1) on paper
        hairline: "#E4E2E8", // subtle borders

        /* ── Legacy aliases → remapped onto the palette above ───────────── */
        ivory: "#F6F5F2", // = paper
        cream: "#EFEDF6", // periwinkle-tinted paper for soft fills
        sage: {
          DEFAULT: "#7774E8", // = periwinkle
          soft: "#C7C5F5",
          deep: "#4B47C9" // = periwinkle.deep (primary buttons / selected)
        },
        teal: {
          DEFAULT: "#6C7AE0", // periwinkle-leaning blue (focus, links, top-priority)
          soft: "#C3CBF7",
          deep: "#4350C4"
        },
        mist: "#B9C5F5", // = sky
        charcoal: "#292B37", // = body
        warmgray: "#5F6270", // = subtle
        line: "#E4E2E8" // = hairline
      },
      fontFamily: {
        // Editorial high-contrast serif for display; readable humanist sans for UI.
        // System stacks only, so the production build never depends on fetching a
        // webfont and the layout still works if a face is unavailable.
        sans: [
          "var(--font-sans)",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica",
          "Arial",
          "sans-serif"
        ],
        display: [
          "var(--font-display)",
          "Iowan Old Style",
          "Palatino Linotype",
          "Book Antiqua",
          "Palatino",
          "Georgia",
          "Cambria",
          "Times New Roman",
          "serif"
        ]
      },
      fontSize: {
        // A deliberate editorial scale (major-third-ish) with tightened display tracking.
        display: ["clamp(2.5rem, 6vw, 4.25rem)", { lineHeight: "1.02", letterSpacing: "-0.025em" }],
        "display-sm": ["clamp(1.9rem, 4vw, 2.6rem)", { lineHeight: "1.08", letterSpacing: "-0.02em" }],
        title: ["1.4rem", { lineHeight: "1.25", letterSpacing: "-0.01em" }],
        lead: ["1.125rem", { lineHeight: "1.65" }],
        eyebrow: ["0.72rem", { lineHeight: "1.2", letterSpacing: "0.18em" }]
      },
      borderRadius: {
        // Less "one rounded rectangle everywhere": a tighter, more editorial set.
        card: "0.875rem", // 14px
        lg: "0.625rem", // 10px — buttons, inputs
        sm: "0.375rem",
        pill: "999px"
      },
      boxShadow: {
        // Cooler, quieter shadows that sit on the ink/paper palette.
        soft: "0 1px 2px rgba(32,36,58,0.05), 0 8px 24px rgba(32,36,58,0.06)",
        lift: "0 2px 8px rgba(32,36,58,0.08), 0 20px 48px rgba(32,36,58,0.12)",
        inset: "inset 0 1px 0 rgba(255,255,255,0.6)",
        accent: "0 6px 20px rgba(110,90,158,0.26)"
      },
      maxWidth: {
        shell: "72rem"
      },
      transitionTimingFunction: {
        editorial: "cubic-bezier(0.22, 0.61, 0.36, 1)"
      }
    }
  },
  plugins: []
};

export default config;
