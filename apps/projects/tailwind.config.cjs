module.exports = {
  // Relative path on purpose: Tailwind only tracks relatively-required config files as
  // dependencies, so edits to the shared preset invalidate Next's webpack cache and hot-reload.
  presets: [require("../../packages/ui/tailwind-preset.cjs")],
  content: ["./app/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}", "../../packages/ui/src/**/*.{ts,tsx}"],
};
