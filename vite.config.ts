/// <reference types="vitest/config" />
import { resolve } from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: "/ir-visualizer/",
  resolve: {
    alias: {
      "@ir-graph-core": resolve(__dirname, "packages/ir-graph-core/src"),
      "@ir-graph-react": resolve(__dirname, "packages/ir-graph-react/src"),
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        debug: resolve(__dirname, "debug.html"),
      },
    },
  },
  server: {
    watch: {
      usePolling: true,
    },
  },
  test: {
    include: ["src/**/*.test.ts", "packages/**/*.test.ts"],
    environment: "node",
  },
});
