import { BaseEdge, type EdgeProps, getBezierPath } from "@xyflow/react";

const CustomBezierEdge = ({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
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

  return <BaseEdge path={edgePath} markerEnd={markerEnd} style={style} />;
};

export default CustomBezierEdge;
