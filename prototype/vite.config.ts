import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

export default defineConfig({
  plugins: [react(), viteSingleFile()],
  build: { outDir: "dist", cssCodeSplit: false, assetsInlineLimit: 100_000_000 },
});
