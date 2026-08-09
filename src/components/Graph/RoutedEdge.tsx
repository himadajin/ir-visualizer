import {
  BaseEdge,
  getSmoothStepPath,
  useInternalNode,
  type Edge,
  type EdgeProps,
} from "@xyflow/react";

/**
 * Geometry attached to every routed edge by the ELK layout
 * (specs/graph-view.md §4). `sourcePos`/`targetPos` are the endpoint nodes'
 * layout positions (top-left), recorded so the renderer can detect that a
 * node was dragged away from where the route was computed.
 */
export interface RoutedEdgeData extends Record<string, unknown> {
  route?: {
    points: { x: number; y: number }[];
    sourcePos: { x: number; y: number };
    targetPos: { x: number; y: number };
  };
  isBackEdge?: boolean;
}

export type RoutedEdgeType = Edge<RoutedEdgeData, "routed">;

/** Corner radius of routed orthogonal bends, px. */
const BEND_RADIUS = 8;

/** A node counts as "at its layout position" within this tolerance, px. */
const STALE_TOLERANCE = 0.5;

/**
 * Rounded-corner path through an orthogonal polyline. Consecutive duplicate
 * points are skipped; the radius shrinks to fit short segments.
 */
const roundedPath = (points: { x: number; y: number }[]): string => {
  if (points.length === 0) return "";
  const parts = [`M ${String(points[0].x)} ${String(points[0].y)}`];
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const corner = points[i];
    const next = points[i + 1];
    const inLen = Math.hypot(corner.x - prev.x, corner.y - prev.y);
    const outLen = Math.hypot(next.x - corner.x, next.y - corner.y);
    if (inLen === 0 || outLen === 0) continue;
    const radius = Math.min(BEND_RADIUS, inLen / 2, outLen / 2);
    const inX = corner.x - ((corner.x - prev.x) / inLen) * radius;
    const inY = corner.y - ((corner.y - prev.y) / inLen) * radius;
    const outX = corner.x + ((next.x - corner.x) / outLen) * radius;
    const outY = corner.y + ((next.y - corner.y) / outLen) * radius;
    parts.push(
      `L ${String(inX)} ${String(inY)}`,
      `Q ${String(corner.x)} ${String(corner.y)} ${String(outX)} ${String(outY)}`,
    );
  }
  const last = points[points.length - 1];
  parts.push(`L ${String(last.x)} ${String(last.y)}`);
  return parts.join(" ");
};

/** Midpoint along the polyline (by arc length), for label placement. */
const midpoint = (points: { x: number; y: number }[]) => {
  let total = 0;
  const lengths: number[] = [];
  for (let i = 1; i < points.length; i++) {
    const len = Math.hypot(
      points[i].x - points[i - 1].x,
      points[i].y - points[i - 1].y,
    );
    lengths.push(len);
    total += len;
  }
  let remaining = total / 2;
  for (let i = 1; i < points.length; i++) {
    const len = lengths[i - 1];
    if (remaining <= len && len > 0) {
      const t = remaining / len;
      return {
        x: points[i - 1].x + (points[i].x - points[i - 1].x) * t,
        y: points[i - 1].y + (points[i].y - points[i - 1].y) * t,
      };
    }
    remaining -= len;
  }
  return points[Math.floor(points.length / 2)] ?? { x: 0, y: 0 };
};

/**
 * Self-loop drawn from the node's live rect: out of the bottom-right area,
 * up the right side, back into the top. Used when ELK yields no usable
 * route for a self-loop and in the drag-fallback state.
 */
const selfLoopPoints = (rect: {
  x: number;
  y: number;
  width: number;
  height: number;
}): { x: number; y: number }[] => {
  const lane = rect.x + rect.width + 24;
  return [
    { x: rect.x + rect.width * 0.75, y: rect.y + rect.height },
    { x: rect.x + rect.width * 0.75, y: rect.y + rect.height + 16 },
    { x: lane, y: rect.y + rect.height + 16 },
    { x: lane, y: rect.y - 16 },
    { x: rect.x + rect.width * 0.75, y: rect.y - 16 },
    { x: rect.x + rect.width * 0.75, y: rect.y },
  ];
};

const near = (
  a: { x: number; y: number },
  b: { x: number; y: number },
): boolean =>
  Math.abs(a.x - b.x) <= STALE_TOLERANCE &&
  Math.abs(a.y - b.y) <= STALE_TOLERANCE;

/**
 * The one edge renderer for LLVM/Mermaid edges: draws the ELK route as a
 * rounded orthogonal polyline; falls back to a live smoothstep path (or a
 * synthesized self-loop) when an endpoint node has been dragged away from
 * its layout position (specs/graph-view.md §4).
 */
const RoutedEdge = ({
  source,
  target,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  label,
  style = {},
  markerStart,
  markerEnd,
}: EdgeProps<RoutedEdgeType>) => {
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);

  const route = data?.route;
  const fresh =
    route !== undefined &&
    sourceNode !== undefined &&
    targetNode !== undefined &&
    near(sourceNode.internals.positionAbsolute, route.sourcePos) &&
    near(targetNode.internals.positionAbsolute, route.targetPos);

  let path: string;
  let labelPoint: { x: number; y: number };

  if (fresh && route.points.length >= 2) {
    path = roundedPath(route.points);
    labelPoint = midpoint(route.points);
  } else if (source === target && sourceNode !== undefined) {
    const points = selfLoopPoints({
      ...sourceNode.internals.positionAbsolute,
      width: sourceNode.measured.width ?? 0,
      height: sourceNode.measured.height ?? 0,
    });
    path = roundedPath(points);
    labelPoint = midpoint(points);
  } else {
    const [stepPath, labelX, labelY] = getSmoothStepPath({
      sourceX,
      sourceY,
      sourcePosition,
      targetX,
      targetY,
      targetPosition,
      borderRadius: BEND_RADIUS,
    });
    path = stepPath;
    labelPoint = { x: labelX, y: labelY };
  }

  return (
    <BaseEdge
      path={path}
      label={label}
      labelX={labelPoint.x}
      labelY={labelPoint.y}
      markerStart={markerStart}
      markerEnd={markerEnd}
      style={style}
    />
  );
};

export default RoutedEdge;
