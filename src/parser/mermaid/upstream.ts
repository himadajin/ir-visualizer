/**
 * mermaid@11.16.1 publishes the flowchart parser and FlowDB only inside this
 * hashed chunk — the package has no parser-only export. The hash is part of
 * the exact pin: a mermaid bump that renames the file fails the build.
 */
export { createFlowDiagram } from "mermaid/dist/chunks/mermaid.core/flowDiagram-UKHOOZJN.mjs";
