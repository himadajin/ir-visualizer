import { BEND_RADIUS as SPACING_BEND_RADIUS } from "../../utils/spacing";

/**
 * Corner radius of routed orthogonal bends, px — derived, not chosen
 * (`specs/graph-view.md` §4). Re-exported from `src/utils/spacing.ts` so the
 * drawn stroke and the layout/router clearances cannot disagree.
 */
export const BEND_RADIUS = SPACING_BEND_RADIUS;

/**
 * Rounded-corner path through an orthogonal polyline. Consecutive duplicate
 * points are skipped; the radius shrinks to fit short segments — the safety
 * valve for corridors narrower than the relation above demands.
 */
export const roundedPath = (points: { x: number; y: number }[]): string => {
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
