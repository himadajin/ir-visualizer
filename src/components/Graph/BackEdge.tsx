import { BaseEdge, type EdgeProps } from '@xyflow/react';

const BackEdge = ({
    sourceX,
    sourceY,
    targetX,
    targetY,
    style = {},
    markerEnd,
}: EdgeProps) => {
    // parameter
    const upLength = 40;
    const radiusX = 90;
    const radiusY = 50;
    const curveIntensity = upLength;
    // source
    const sourceArcEndX = sourceX + (radiusX * 2);
    const sourceArcEndY = sourceY;
    // target
    const targetArcStartX = targetX + (radiusX * 2);
    const targetArcStartY = targetY;
    // 頂点
    const topX = (sourceArcEndX + targetArcStartX) / 2;
    const topY = ((sourceArcEndY - upLength) + (targetArcStartY + upLength)) / 2;
    // 制御点
    const cp1X = sourceArcEndX;
    const cp1Y = sourceArcEndY - curveIntensity;
    const cp2X = sourceArcEndX;
    const cp2Y = sourceArcEndY - upLength;
    const cp3X = targetArcStartX;
    const cp3Y = targetArcStartY + curveIntensity;
    const path = `
        M ${sourceX} ${sourceY}
        A ${radiusX} ${radiusY} 0 0 0 ${sourceArcEndX} ${sourceArcEndY}
        C ${cp1X} ${cp1Y} ${cp2X} ${cp2Y} ${topX} ${topY}
        S ${cp3X} ${cp3Y} ${targetArcStartX} ${targetArcStartY}
        A ${radiusX} ${radiusY} 0 0 0 ${targetX} ${targetY}
    `;
    return (
        <BaseEdge path={path} markerEnd={markerEnd} style={style} />
    );
};

export default BackEdge;
