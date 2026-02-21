import { expect } from "vitest";
import type { GraphEdge, GraphNode } from "../../../types/graph";

export function findNodeByType(
  nodes: GraphNode[],
  nodeType: string,
): GraphNode | undefined {
  return nodes.find((node) => node.nodeType === nodeType);
}

export function edgesFrom(edges: GraphEdge[], source: string): GraphEdge[] {
  return edges.filter((edge) => edge.source === source);
}

export function expectUniqueIds(items: { id: string }[]): void {
  const ids = items.map((item) => item.id);
  expect(new Set(ids).size).toBe(ids.length);
}
