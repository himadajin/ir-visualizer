import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Position,
  useStoreApi,
  type Edge,
  type InternalNode,
} from "@xyflow/react";
import { routeEdges } from "../utils/edgeRouter";
import type {
  Point,
  RouteNodeRect,
  RouteRequest,
  RouteSide,
} from "../types/edgeRouting";

/**
 * The one routing pass per graph (`contracts/edge-routing.md`,
 * `specs/graph-view.md` §4).
 *
 * `routeEdges` takes every node and every request in a single call, so it
 * cannot be driven from a per-edge component. This hook reads React Flow's
 * store — **measured** rects and live handle positions, never the estimates
 * `converter.ts` hands to ELK — calls the router once per animation frame in
 * which something geometric changed, and publishes the resulting
 * `Map<edgeId, points>` through a React context. `RoutedEdge` looks up its own
 * entry by edge id; an edge with no entry is not drawn that frame.
 */

/** Routes keyed by React Flow edge id. */
export type EdgeRouteMap = ReadonlyMap<string, Point[]>;

const EMPTY_ROUTES: EdgeRouteMap = new Map<string, Point[]>();

const EdgeRoutesContext = createContext<EdgeRouteMap>(EMPTY_ROUTES);

/** The current polyline for one edge, or `undefined` when it has none. */
export const useEdgeRoute = (edgeId: string): Point[] | undefined =>
  useContext(EdgeRoutesContext).get(edgeId);

const SIDE_BY_POSITION: Record<Position, RouteSide> = {
  [Position.Top]: "top",
  [Position.Right]: "right",
  [Position.Bottom]: "bottom",
  [Position.Left]: "left",
};

type HandleBounds = NonNullable<InternalNode["internals"]["handleBounds"]>;
type MeasuredHandle = NonNullable<HandleBounds["source"]>[number];

interface HandleAnchor {
  point: Point;
  side: RouteSide;
}

/**
 * Where an edge attaches, in flow coordinates: the handle's center *along* the
 * side it sits on, projected onto the node's measured rect *across* it
 * (`specs/graph-view.md` §4).
 *
 * This deliberately does **not** mirror React Flow's own `getHandlePosition`.
 * A handle is positioned from the node's padding box, so its measured bounds
 * sit one border-width inside the rect the router treats as the obstacle;
 * anchoring on the handle box would leave the drawn attachment point and the
 * router's clearance geometry as two independently derived numbers. Taking the
 * across-side coordinate from the rect makes the `nodeMargin`-pushed point
 * coincide with the node's inflated boundary by construction. The along-side
 * coordinate keeps coming from the handle, so per-operand ports (the Use-Def
 * view) still leave from their own offsets.
 *
 * `null` when React Flow has not measured the node yet — such a node is
 * omitted from the rects too (`collectRects`), so its edges are not drawn this
 * frame either way.
 */
const anchorOf = (
  node: InternalNode,
  handle: MeasuredHandle,
): HandleAnchor | null => {
  const { width, height } = node.measured;
  if (width === undefined || height === undefined) return null;
  const left = node.internals.positionAbsolute.x;
  const top = node.internals.positionAbsolute.y;
  const alongX = left + handle.x + handle.width / 2;
  const alongY = top + handle.y + handle.height / 2;
  const side = SIDE_BY_POSITION[handle.position];
  switch (handle.position) {
    case Position.Top:
      return { point: { x: alongX, y: top }, side };
    case Position.Right:
      return { point: { x: left + width, y: alongY }, side };
    case Position.Bottom:
      return { point: { x: alongX, y: top + height }, side };
    case Position.Left:
      return { point: { x: left, y: alongY }, side };
  }
};

/**
 * The handle an edge end attaches to. A named handle (the Use-Def view's
 * per-operand ports) resolves to that port's own bounds and `Position`; an
 * unnamed one takes the node's first handle of that type, exactly as React
 * Flow does. `null` when React Flow has not measured the handles — or the node
 * itself — yet.
 */
const handleAnchor = (
  node: InternalNode,
  type: "source" | "target",
  handleId: string | null | undefined,
): HandleAnchor | null => {
  const bounds = node.internals.handleBounds;
  const handles = (type === "source" ? bounds?.source : bounds?.target) ?? null;
  if (handles === null) return null;
  const handle =
    handleId === null || handleId === undefined
      ? handles[0]
      : handles.find((candidate) => candidate.id === handleId);
  if (handle === undefined) return null;
  return anchorOf(node, handle);
};

/**
 * Rects for the router. A node React Flow has not measured yet is **omitted**
 * (`specs/graph-view.md` §4, "Unmeasured endpoints"): its edges then get no
 * entry from `routeEdges` and are not drawn this frame. No placeholder shape —
 * one would reintroduce the second geometry generator this design exists to
 * remove.
 */
const collectRects = (
  nodeLookup: ReadonlyMap<string, InternalNode>,
): RouteNodeRect[] => {
  const rects: RouteNodeRect[] = [];
  for (const node of nodeLookup.values()) {
    const { width, height } = node.measured;
    if (width === undefined || height === undefined) continue;
    rects.push({
      id: node.id,
      x: node.internals.positionAbsolute.x,
      y: node.internals.positionAbsolute.y,
      width,
      height,
    });
  }
  return rects;
};

/**
 * One request per `routed` edge. SelectionDAG's edges use React Flow's
 * built-in `default` type and are deliberately left alone — they keep their
 * handle-anchored beziers (`specs/graph-view.md` §4).
 */
const collectRequests = (
  edges: readonly Edge[],
  nodeLookup: ReadonlyMap<string, InternalNode>,
): RouteRequest[] => {
  const requests: RouteRequest[] = [];
  for (const edge of edges) {
    if (edge.type !== "routed") continue;
    const sourceNode = nodeLookup.get(edge.source);
    const targetNode = nodeLookup.get(edge.target);
    if (sourceNode === undefined || targetNode === undefined) continue;
    const source = handleAnchor(sourceNode, "source", edge.sourceHandle);
    const target = handleAnchor(targetNode, "target", edge.targetHandle);
    if (source === null || target === null) continue;
    requests.push({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourcePoint: source.point,
      targetPoint: target.point,
      sourceSide: source.side,
      targetSide: target.side,
    });
  }
  return requests;
};

/**
 * Cheap fingerprint of everything the router reads. React Flow's store also
 * notifies on viewport changes (panning, zooming), which move no rect and no
 * handle; comparing this string keeps those frames from re-routing anything.
 */
const inputSignature = (
  rects: readonly RouteNodeRect[],
  requests: readonly RouteRequest[],
): string => {
  const parts: string[] = [];
  for (const rect of rects) {
    parts.push(
      `${rect.id}@${String(rect.x)},${String(rect.y)},${String(rect.width)},${String(rect.height)}`,
    );
  }
  parts.push("|");
  for (const request of requests) {
    parts.push(
      `${request.id}:${request.source}>${request.target}` +
        `@${String(request.sourcePoint.x)},${String(request.sourcePoint.y)}` +
        `>${String(request.targetPoint.x)},${String(request.targetPoint.y)}` +
        `:${request.sourceSide}${request.targetSide}`,
    );
  }
  return parts.join(";");
};

/**
 * Runs the routing pass and returns the current route map.
 *
 * Throttled to animation frames. **During a drag only the edges incident to a
 * moved node are re-routed** and the results are merged over the previous map;
 * a full pass runs on drag stop (`specs/graph-view.md` §4). That split is
 * required rather than opportunistic: a full pass overruns the 16.7 ms frame
 * budget from roughly 180 nodes, which the Use-Def view can reach. The router
 * is a pure function of the rects it is given, so an incident-only pass is
 * just a call with a filtered `requests` array — the `nodes` array stays
 * complete, or the partial routes would route through the wrong obstacles.
 */
export const useEdgeRoutes = (): EdgeRouteMap => {
  const store = useStoreApi();
  const [routes, setRoutes] = useState<EdgeRouteMap>(EMPTY_ROUTES);

  const routesRef = useRef<EdgeRouteMap>(EMPTY_ROUTES);
  const frameRef = useRef<number | null>(null);
  const signatureRef = useRef<string | null>(null);
  const wasDraggingRef = useRef(false);

  useEffect(() => {
    const runPass = () => {
      frameRef.current = null;
      const { nodeLookup, edges } = store.getState();

      const rects = collectRects(nodeLookup);
      const requests = collectRequests(edges, nodeLookup);
      const signature = inputSignature(rects, requests);

      const dragged = new Set<string>();
      for (const node of nodeLookup.values()) {
        if (node.dragging === true) dragged.add(node.id);
      }
      const isDragging = dragged.size > 0;
      // A drag that just stopped needs the full pass even though nothing moved
      // in this frame: the edges that are not incident to the dragged node were
      // left routing around its old rect.
      const dragJustStopped = wasDraggingRef.current && !isDragging;
      wasDraggingRef.current = isDragging;
      if (signature === signatureRef.current && !dragJustStopped) return;
      signatureRef.current = signature;

      let next: EdgeRouteMap;
      if (isDragging) {
        const incident = requests.filter(
          (request) =>
            dragged.has(request.source) || dragged.has(request.target),
        );
        const partial = routeEdges(rects, incident);
        const merged = new Map(routesRef.current);
        for (const request of incident) {
          const points = partial.get(request.id);
          if (points === undefined) merged.delete(request.id);
          else merged.set(request.id, points);
        }
        next = merged;
      } else {
        next = routeEdges(rects, requests);
      }

      routesRef.current = next;
      setRoutes(next);
    };

    const schedule = () => {
      if (frameRef.current !== null) return;
      frameRef.current = requestAnimationFrame(runPass);
    };

    schedule();
    const unsubscribe = store.subscribe(schedule);
    return () => {
      unsubscribe();
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    };
  }, [store]);

  return routes;
};

/**
 * Publishes the routing pass to every `RoutedEdge` below it. It must sit
 * *above* `<ReactFlow>` — React Flow renders its own children beside the edge
 * renderer, not around it — and inside the app's `ReactFlowProvider`, whose
 * store the pass reads.
 */
export const EdgeRoutesProvider = ({ children }: { children: ReactNode }) => {
  const routes = useEdgeRoutes();
  return createElement(EdgeRoutesContext.Provider, { value: routes }, children);
};
