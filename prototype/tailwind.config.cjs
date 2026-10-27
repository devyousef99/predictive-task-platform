module.exports = {
  // Relative path so Tailwind tracks the shared preset as a dependency (see apps/*/tailwind.config.cjs).
  presets: [require("../packages/ui/tailwind-preset.cjs")],
  content: ["./index.html", "./src/**/*.{ts,tsx}", "../packages/ui/src/**/*.{ts,tsx}"],
};
