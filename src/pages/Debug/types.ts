import type React from "react";

// ─── Types ───────────────────────────────────────────────────────────────

export interface NodeDef {
  title: string;
  nodeType: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  astData: Record<string, any>;
}

export interface NodeDefGroup {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  nodeTypes: Record<string, React.ComponentType<any>>;
  defs: NodeDef[];
}

// ─── Styles ──────────────────────────────────────────────────────────────

export const styles: Record<string, React.CSSProperties> = {
  page: {
    padding: "24px",
    maxWidth: "1200px",
    margin: "0 auto",
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  toolbar: {
    position: "sticky",
    top: 0,
    zIndex: 100,
    display: "flex",
    alignItems: "center",
    gap: "16px",
    padding: "12px 16px",
    marginBottom: "24px",
    background: "#1976d2",
    color: "#fff",
    borderRadius: "8px",
    boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
  },
  toolbarTitle: {
    fontSize: "20px",
    fontWeight: 700,
    margin: 0,
    flexGrow: 1,
  },
  toolbarSelect: {
    padding: "6px 12px",
    fontSize: "14px",
    borderRadius: "4px",
    border: "none",
    cursor: "pointer",
  },
  previewContainer: {
    marginBottom: "32px",
    border: "1px solid #e0e0e0",
    borderRadius: "8px",
    overflow: "hidden",
    background: "#fafafa",
  },
  previewTitle: {
    margin: 0,
    padding: "12px 16px",
    background: "#f5f5f5",
    borderBottom: "1px solid #e0e0e0",
    fontSize: "16px",
    fontWeight: 600,
  },
  previewBody: {
    display: "flex",
    minHeight: "300px",
  },
  jsonPane: {
    width: "340px",
    minWidth: "340px",
    padding: "16px",
    borderRight: "1px solid #e0e0e0",
    background: "#fff",
    overflowY: "auto",
    overflowX: "auto",
    fontSize: "12px",
  },
  graphPane: {
    flex: 1,
    minHeight: "300px",
    position: "relative",
  },
  jsonPre: {
    margin: 0,
    fontSize: "12px",
    fontFamily: "'Menlo', 'Consolas', 'Courier New', monospace",
    color: "#333",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    lineHeight: 1.5,
  },
};
