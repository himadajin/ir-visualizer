export const mermaidMinimalGraph = `
graph TD
A --> B`;

export const mermaidFlowchartGraph = `
flowchart LR
A --> B`;

export const mermaidDiamondGraph = `
graph TD
A[Start] --> B{Decision}
B -->|Yes| C[OK]
B -->|No| D[Not OK]
C --> E[End]
D --> E`;

export const mermaidNodeDeclarations = `
graph TD
A[Standalone Node]
B[Another Node]`;
