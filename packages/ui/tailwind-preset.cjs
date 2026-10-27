/**
 * Shared Tailwind preset — every zone and the prototype extend this so the UI stays one system.
 * Colours resolve through CSS variables (see styles.css) so the same utility classes render the
 * light or dark palette depending on the `dark` class on <html>.
 */
const v = (name) => `rgb(var(--c-${name}) / <alpha-value>)`;

module.exports = {
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        surface: v("surface"),
        canvas: v("canvas"),
        line: v("line"),
        /** Solid fills that carry white text (buttons, switches) — stays mid-blue in both themes. */
        accent: { DEFAULT: v("accent"), hover: v("accent-hover") },
        brand: { 50: v("brand-50"), 100: v("brand-100"), 200: v("brand-200"), 500: v("brand-500"), 600: v("brand-600"), 700: v("brand-700"), 800: "#143D6C" },
        ink: { 900: v("ink-900"), 700: v("ink-700"), 500: v("ink-500"), 400: v("ink-400"), 300: v("ink-300") },
        slate: { 50: v("slate-50"), 100: v("slate-100"), 200: v("slate-200") },
        ok: { 50: v("ok-50"), 600: v("ok-600"), 700: v("ok-700") },
        warn: { 50: v("warn-50"), 600: v("warn-600"), 700: v("warn-700") },
        danger: { 50: v("danger-50"), 600: v("danger-600"), 700: v("danger-700") },
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', '"IBM Plex Sans Arabic"', "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
      },
      borderRadius: { DEFAULT: "6px", md: "8px", lg: "10px", xl: "14px" },
      boxShadow: {
        card: "var(--shadow-card)",
        pop: "var(--shadow-pop)",
        /** Focus halos follow the theme's brand / danger colour. */
        focus: "0 0 0 3px rgb(var(--c-brand-600) / 0.25)",
        "focus-danger": "0 0 0 3px rgb(var(--c-danger-600) / 0.25)",
      },
      keyframes: {
        rise: { from: { opacity: "0", transform: "translateY(6px)" }, to: { opacity: "1", transform: "translateY(0)" } },
        shimmer: { "0%": { backgroundPosition: "-200% 0" }, "100%": { backgroundPosition: "200% 0" } },
      },
      animation: { rise: "rise .25s ease-out both", shimmer: "shimmer 1.5s infinite" },
    },
  },
  plugins: [],
};
