/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: "/ir-visualizer/",
  server: {
    // Honor an externally assigned port (e.g. a preview harness's PORT env)
    // instead of always claiming 5173.
    port: process.env.PORT ? Number(process.env.PORT) : undefined,
    watch: {
      usePolling: true,
    },
  },
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    environment: "node",
    setupFiles: ["./src/test/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/__tests__/**",
        "src/**/*.test.{ts,tsx}",
        "src/vite-env.d.ts",
        "src/test/**",
      ],
    },
  },
});
