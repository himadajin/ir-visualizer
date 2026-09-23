import { useEffect, type ComponentType } from "react";
import {
  Handle,
  Position,
  useUpdateNodeInternals,
  type NodeProps,
} from "@xyflow/react";
import type { NodePortLayout } from "../../../types/nodePorts";

/**
 * One borderless coordinate frame for all routed-node handles. The inner card
 * fills this frame, so CSS border thickness cannot shift an arrival. SelectionDAG
 * has no portLayout and keeps its own handles.
 */
export const withNodePorts = (Component: ComponentType<NodeProps>) => {
  const PortNode = (props: NodeProps) => {
    const layout = props.data.portLayout as NodePortLayout | undefined;
    const updateNodeInternals = useUpdateNodeInternals();
    useEffect(() => {
      if (layout !== undefined) updateNodeInternals(props.id);
    }, [props.id, layout, updateNodeInternals]);

    if (layout === undefined) return <Component {...props} />;
    return (
      <div
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          minWidth: Math.ceil(layout.minWidth),
        }}
      >
        <Component {...props} />
        {layout.ports.map((port) => (
          <Handle
            key={port.id}
            id={port.id}
            type={port.side === "top" ? "target" : "source"}
            position={port.side === "top" ? Position.Top : Position.Bottom}
            isConnectable={false}
            style={{
              opacity: 0,
              [port.side]: 0,
              left: port.relative ? `${String(port.x * 100)}%` : port.x,
              transform:
                port.side === "top"
                  ? "translate(-50%, -50%)"
                  : "translate(-50%, 50%)",
              width: 1,
              height: 1,
              minWidth: 0,
              minHeight: 0,
            }}
          />
        ))}
      </div>
    );
  };
  return PortNode;
};
