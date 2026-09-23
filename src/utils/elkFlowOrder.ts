import type { ElkNode } from "elkjs/lib/elk-api";
import type { GraphEdge } from "../types/graph";

/**
 * In UP graphs all physical ports oppose the flow. ELK's default feedback-node
 * heuristic reverses their edges even in a DAG. MODEL_ORDER skips that heuristic;
 * supply a topology order so input array order cannot reverse an acyclic edge.
 */
export const preserveUpwardFlow = (
  root: ElkNode,
  edges: readonly Pick<GraphEdge, "source" | "target">[],
): void => {
  if (root.layoutOptions?.["elk.direction"] !== "UP") return;
  const children = root.children ?? [];
  const successors = new Map(children.map((n) => [n.id, new Set<string>()]));
  const degree = new Map(children.map((n) => [n.id, 0]));
  for (const edge of edges) {
    const { source, target } = edge;
    if (!successors.has(source) || !successors.has(target) || source === target)
      continue;
    const targets = successors.get(source)!;
    if (!targets.has(target)) {
      targets.add(target);
      degree.set(target, degree.get(target)! + 1);
    }
  }
  const remaining = new Map(
    [...children]
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      .map((n) => [n.id, n]),
  );
  const ordered: ElkNode[] = [];
  while (remaining.size > 0) {
    const ids = [...remaining.keys()];
    const id = ids.find((key) => degree.get(key) === 0) ?? ids[0];
    ordered.push(remaining.get(id)!);
    remaining.delete(id);
    for (const target of successors.get(id)!)
      degree.set(target, degree.get(target)! - 1);
  }
  root.children = ordered;
  root.layoutOptions["elk.layered.cycleBreaking.strategy"] = "MODEL_ORDER";
};
