import React, { useState } from "react";
import { NodePreview } from "./NodePreview";
import { llvmNodeGroup } from "./llvmNodeDefs";
import { mermaidNodeGroup } from "./mermaidNodeDefs";
import { styles } from "./types";
import type { NodeDefGroup } from "./types";

type Mode = "llvm" | "mermaid";

export default function NodeDebugPage() {
  const [mode, setMode] = useState<Mode>("llvm");

  // Override index.css overflow:hidden so the debug page can scroll
  React.useEffect(() => {
    const root = document.getElementById("root");
    document.documentElement.style.overflow = "auto";
    document.body.style.overflow = "auto";
    if (root) root.style.overflow = "auto";
    return () => {
      document.documentElement.style.overflow = "";
      document.body.style.overflow = "";
      if (root) root.style.overflow = "";
    };
  }, []);

  const groups: Record<Mode, NodeDefGroup> = {
    llvm: llvmNodeGroup,
    mermaid: mermaidNodeGroup,
  };
  const group = groups[mode];

  return (
    <div style={styles.page}>
      {/* Toolbar */}
      <div style={styles.toolbar}>
        <h1 style={styles.toolbarTitle}>Node Debug Gallery</h1>
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value as Mode)}
          style={styles.toolbarSelect}
        >
          <option value="llvm">LLVM</option>
          <option value="mermaid">Mermaid</option>
        </select>
      </div>

      {/* Node previews */}
      {group.defs.map((def, i) => (
        <NodePreview
          key={`${mode}-${def.nodeType}-${i}`}
          title={def.title}
          nodeType={def.nodeType}
          astData={def.astData}
          nodeTypes={group.nodeTypes}
        />
      ))}
    </div>
  );
}
