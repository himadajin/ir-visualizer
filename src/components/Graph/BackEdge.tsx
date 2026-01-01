import { BaseEdge, type EdgeProps } from '@xyflow/react';

const BackEdge = ({
    sourceX,
    sourceY,
    targetX,
    targetY,
    style = {},
    markerEnd,
}: EdgeProps) => {
    const offset = 200;

    // Multi-segment Bezier was not bulgy enough.
    // User requested separate points on src and dst sides.

    // CP1: Right of source (sourceX + offset)
    // CP2: Right of target (targetX + offset)
    const path = [
        `M ${sourceX} ${sourceY}`,
        `C ${sourceX + offset} ${sourceY}`,
        `${targetX + offset} ${targetY}`,
        `${targetX} ${targetY}`,
    ].join(' ');

    return (
        <BaseEdge path={path} markerEnd={markerEnd} style={style} />
    );
};

export default BackEdge;
