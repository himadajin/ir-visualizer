/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * mermaid's published flowchart module pulls renderer-only code this app never
 * calls (layout engines, KaTeX). Stubbing those imports keeps the mermaid
 * dependency a parser (`contracts/bundle-budget.md`, `specs/mermaid.md`).
 */
function stubMermaidRendererDeps() {
  return {
    name: "stub-mermaid-renderer-deps",
    enforce: "pre" as const,
    resolveId(source: string) {
      if (source === "katex" || source.startsWith("katex/")) {
        return "\0stub-katex";
      }
      return undefined;
    },
    load(id: string) {
      const normalized = id.replaceAll("\\", "/");
      if (
        id === "\0stub-katex" ||
        normalized.includes("/node_modules/katex/")
      ) {
        return "export default { renderToString: (text) => text };";
      }
      if (
        /\/mermaid\/dist\/chunks\/mermaid\.core\/(dagre-|swimlanes-|cose-bilkent-)/.test(
          normalized,
        )
      ) {
        return "export async function render() {}\nexport default { render };";
      }
      return undefined;
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), stubMermaidRendererDeps()],
  base: "/ir-visualizer/",
  build: {
    // Per-chunk size is the wrong axis for this app: the warning does not
    // distinguish a chunk fetched on first paint from a lazy one, and elkjs
    // ships as a single 1.4 MB file that no chunking strategy can split.
    // `npm run check:bundle` is the gate instead — contracts/bundle-budget.md.
    chunkSizeWarningLimit: Infinity,
  },
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
