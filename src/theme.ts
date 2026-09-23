import { createTheme, type CSSVariablesResolver } from "@mantine/core";

/**
 * The app's Mantine theme (`specs/graph-view.md` §6.6): Mantine's defaults,
 * with reduced motion honored by every `Transition`.
 */
export const theme = createTheme({
  respectReducedMotion: true,
});

/**
 * The only colors the app assigns meaning to (`specs/graph-view.md` §6.6).
 * Parse-status colors mark non-text elements only, at shades that reach 3:1
 * against white; the canvas ground is the layer every surface floats above.
 */
export const cssVariablesResolver: CSSVariablesResolver = () => ({
  variables: {
    "--app-status-ok": "var(--mantine-color-green-8)",
    "--app-status-warn": "var(--mantine-color-yellow-9)",
    "--app-status-error": "var(--mantine-color-red-8)",
    "--app-canvas-ground": "var(--mantine-color-gray-0)",
    "--app-canvas-dots": "var(--mantine-color-gray-4)",
  },
  light: {},
  dark: {},
});
