import { BaseEdge, type EdgeProps, getBezierPath } from "@xyflow/react";

const CustomBezierEdge = ({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerStart,
}: EdgeProps) => {
  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    curvature: 0.75,
  });

  return <BaseEdge path={edgePath} markerStart={markerStart} style={style} />;
};

export default CustomBezierEdge;
