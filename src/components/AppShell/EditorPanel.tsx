import type { MouseEvent, WheelEvent } from "react";
import {
  ActionIcon,
  Box,
  Button,
  Group,
  Paper,
  SegmentedControl,
  Select,
  Text,
  Transition,
} from "@mantine/core";
import { IconArrowBarToLeft, IconCheck, IconEraser } from "@tabler/icons-react";
import { CodeEditor } from "../Editor/CodeEditor";
import { IR_MODE_LIST, type IRModeKey } from "../../irModes";
import type { IRParseDiagnostic, IRViewDefinition } from "../../irModes/types";
import { PANEL_MARGIN, PANEL_MIN_WIDTH, SHELL_MOTION_MS } from "./shellTokens";
import classes from "./EditorPanel.module.css";

const modeOptions = IR_MODE_LIST.map((irMode) => ({
  value: irMode.key,
  label: irMode.label,
}));

/**
 * The footer's left rule carries the worst thing the last parse produced
 * (`specs/graph-view.md` §6.3): an error outranks warnings, and a clean parse
 * gets no rule at all.
 */
const parseStatus = (
  error: string | null,
  diagnostics: IRParseDiagnostic[],
) => {
  if (error) return "error";
  if (diagnostics.length > 0) return "warn";
  return "ok";
};

/**
 * The one orchestrated motion of the shell: the panel ⇄ pill morph, on enter
 * only. Both surfaces grow out of the corner they are anchored to, so the
 * growth reads as coming from the pill: top-left in wide mode, bottom-left for
 * the edge-anchored narrow-mode sheet. The theme's `respectReducedMotion`
 * switches it off under `prefers-reduced-motion`.
 */
const morph = (narrow: boolean) =>
  ({
    transition: narrow ? "pop-bottom-left" : "pop-top-left",
    duration: SHELL_MOTION_MS,
    exitDuration: 0,
    timingFunction: "ease-out",
  }) as const;

interface EditorPanelProps {
  /** false collapses the panel to the floating "Code" pill. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Narrow mode (§6.5): bottom sheet instead of top-left card, no resizer. */
  narrow: boolean;
  width: number;
  /** Height of the narrow-mode sheet, in px; ignored in wide mode. */
  sheetHeight: number;
  onResizeHandleMouseDown: (event: MouseEvent<HTMLDivElement>) => void;
  mode: IRModeKey;
  onModeChange: (mode: IRModeKey) => void;
  /** The active mode's views; the toggle renders only when this is set. */
  views?: IRViewDefinition[];
  activeViewKey?: string | null;
  onViewChange?: (viewKey: string) => void;
  code: string;
  language: string;
  onCodeChange: (value: string | undefined) => void;
  onClear: () => void;
  /** Latest parse error, or null after a successful parse. */
  error: string | null;
  /** Recoverable diagnostics of the latest successful parse; empty otherwise. */
  diagnostics: IRParseDiagnostic[];
  nodeCount: number;
  edgeCount: number;
}

/**
 * The floating editor panel (`specs/graph-view.md` §6.2/§6.3): a card at the
 * top-left holding everything that is not the canvas — the wordmark, mode
 * selector, view toggle, Clear, collapse, the Monaco editor, and the parse
 * status footer. In narrow mode (§6.5) the very same contents are anchored to
 * the bottom edge as a sheet instead; only the geometry changes.
 *
 * Its look comes from the theme and the `--app-*` tokens (§6.6). The only
 * monospace here besides the editor is the status footer, which is compiler
 * output.
 */
export function EditorPanel({
  open,
  onOpenChange,
  narrow,
  width,
  sheetHeight,
  onResizeHandleMouseDown,
  mode,
  onModeChange,
  views,
  activeViewKey,
  onViewChange,
  code,
  language,
  onCodeChange,
  onClear,
  error,
  diagnostics,
  nodeCount,
  edgeCount,
}: EditorPanelProps) {
  // Safety net only: the panel is a DOM sibling of the canvas, so React Flow
  // never sees these events in the first place.
  const stopWheel = (event: WheelEvent) => event.stopPropagation();

  const status = parseStatus(error, diagnostics);

  return (
    <>
      <Transition mounted={!open} {...morph(narrow)}>
        {(transitionStyles) => (
          <Button
            // The pill is the only way back to the editor on a touch screen, so
            // narrow mode sizes it up until the hit target clears ~40 px.
            size={narrow ? "md" : undefined}
            onClick={() => onOpenChange(true)}
            title="Expand panel"
            className={classes.pill}
            style={{
              ...transitionStyles,
              // Bottom-left in narrow mode (thumb reach), top-left otherwise.
              top: narrow ? "auto" : PANEL_MARGIN,
              bottom: narrow ? PANEL_MARGIN : "auto",
              left: PANEL_MARGIN,
            }}
          >
            Code
          </Button>
        )}
      </Transition>

      <Transition mounted={open} {...morph(narrow)}>
        {(transitionStyles) => (
          <Paper
            component="section"
            aria-label="Editor panel"
            withBorder
            onWheel={stopWheel}
            className={classes.panel}
            style={{
              ...transitionStyles,
              // Narrow mode: an edge-to-edge sheet on the bottom edge, so the
              // small viewport spends none of its width on margins. Wide mode:
              // the top-left card, inset from every edge.
              top: narrow ? "auto" : PANEL_MARGIN,
              bottom: narrow ? 0 : PANEL_MARGIN,
              left: narrow ? 0 : PANEL_MARGIN,
              right: narrow ? 0 : "auto",
              width: narrow ? "auto" : width,
              height: narrow ? sheetHeight : "auto",
              minWidth: narrow ? 0 : PANEL_MIN_WIDTH,
              maxWidth: narrow ? "none" : `calc(100vw - ${PANEL_MARGIN * 2}px)`,
              // The sheet sits on the viewport edge, so only its top corners
              // round; the border is kept on all four sides.
              ...(narrow && {
                borderBottomLeftRadius: 0,
                borderBottomRightRadius: 0,
              }),
            }}
          >
            <Group gap={6} px={8} py={6} className={classes.header}>
              <Text fz={13} fw={600} className={classes.brand}>
                IR Visualizer
              </Text>

              <Select
                aria-label="IR mode"
                w={120}
                data={modeOptions}
                value={mode}
                allowDeselect={false}
                onChange={(value) => {
                  if (value !== null) onModeChange(value as IRModeKey);
                }}
              />

              {views && (
                <SegmentedControl
                  data={views.map((view) => ({
                    value: view.key,
                    label: view.label,
                  }))}
                  value={activeViewKey ?? undefined}
                  onChange={(value) => onViewChange?.(value)}
                />
              )}

              {/* One unit, so a wrapping header never strands the collapse
                  button on a row of its own. */}
              <Group gap={6} ml="auto" wrap="nowrap">
                <ActionIcon aria-label="Clear" title="Clear" onClick={onClear}>
                  <IconEraser size={16} />
                </ActionIcon>

                <ActionIcon
                  aria-label="Collapse panel"
                  title="Collapse panel"
                  onClick={() => onOpenChange(false)}
                >
                  <IconArrowBarToLeft size={16} />
                </ActionIcon>
              </Group>
            </Group>

            <Box className={classes.editor}>
              <CodeEditor
                code={code}
                onChange={onCodeChange}
                language={language}
              />
            </Box>

            <Text
              component="div"
              size="xs"
              px="xs"
              py={6}
              data-testid="parse-status"
              data-status={status}
              role="status"
              aria-live="polite"
              className={classes.footer}
            >
              {error ? (
                `error: ${error}`
              ) : (
                <>
                  <IconCheck
                    size={14}
                    aria-hidden="true"
                    className={classes.check}
                  />
                  {`parsed · ${nodeCount} nodes · ${edgeCount} edges`}
                  {/* One line per diagnostic, in the order the parse returned
                      them; none is dropped — a long list scrolls (spec §6.3). */}
                  {diagnostics.map((diagnostic, index) => (
                    <div key={index}>
                      {`warning: line ${String(diagnostic.line)}: ${diagnostic.message}`}
                    </div>
                  ))}
                </>
              )}
            </Text>

            {/* Right-edge drag handle (wide mode only, mouse-driven). The
                narrow-mode sheet is not resizable at all (§6.5). */}
            {!narrow && (
              <div
                aria-hidden="true"
                onMouseDown={onResizeHandleMouseDown}
                className={classes.resizeHandle}
              />
            )}
          </Paper>
        )}
      </Transition>
    </>
  );
}
