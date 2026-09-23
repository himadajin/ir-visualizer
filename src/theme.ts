import {
  ActionIcon,
  Button,
  DEFAULT_THEME,
  SegmentedControl,
  Select,
  createTheme,
  type CSSVariablesResolver,
} from "@mantine/core";

/**
 * The app's Mantine theme (`specs/graph-view.md` §6.6): a quiet gray frame
 * around the canvas. The primary color is neutral, so the focus ring and
 * focused inputs carry no accent; controls are compact by default.
 */
export const theme = createTheme({
  primaryColor: "gray",
  primaryShade: 7,
  // `ink`: Mantine's text color.
  black: DEFAULT_THEME.colors.gray[9],
  defaultRadius: "sm",
  respectReducedMotion: true,
  components: {
    ActionIcon: ActionIcon.extend({
      defaultProps: { variant: "subtle", color: "gray" },
    }),
    Button: Button.extend({
      defaultProps: { variant: "default", size: "xs" },
    }),
    SegmentedControl: SegmentedControl.extend({
      defaultProps: { size: "xs" },
    }),
    Select: Select.extend({
      defaultProps: { size: "xs" },
    }),
  },
});

/**
 * The chrome's tokens (`specs/graph-view.md` §6.6), as `--app-*` CSS
 * variables. Parse-status colors mark non-text elements only, at shades that
 * reach 3:1 against white. `line` is also Mantine's default border color, so
 * `withBorder` surfaces and the app's own rules draw the same line.
 */
export const cssVariablesResolver: CSSVariablesResolver = () => ({
  variables: {
    "--app-ink": "var(--mantine-color-gray-9)",
    "--app-ink-muted": "var(--mantine-color-gray-7)",
    "--app-line": "var(--mantine-color-gray-3)",
    "--app-surface": "var(--mantine-color-white)",
    "--app-canvas": "var(--mantine-color-gray-0)",
    "--app-canvas-dots": "var(--mantine-color-gray-4)",
    "--app-status-ok": "var(--mantine-color-green-8)",
    "--app-status-warn": "var(--mantine-color-yellow-9)",
    "--app-status-error": "var(--mantine-color-red-8)",
    "--app-elevation": "var(--mantine-shadow-sm)",
    "--app-font-mono": "var(--mantine-font-family-monospace)",
  },
  light: {
    "--mantine-color-default-border": "var(--app-line)",
  },
  dark: {},
});
