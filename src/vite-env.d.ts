/// <reference types="vite/client" />

declare module "*.ohm?raw" {
  const content: string;
  export default content;
}

declare module "mermaid/dist/chunks/mermaid.core/flowDiagram-UKHOOZJN.mjs" {
  import type { DiagramDefinition } from "mermaid/dist/diagram-api/types.js";
  export function createFlowDiagram(): DiagramDefinition;
  export const diagram: DiagramDefinition;
}
