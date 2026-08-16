import type { NodeProps } from "@xyflow/react";
import type { LLVMUseDefValueData } from "../../../../ast/llvmAST";
import NodeShell from "../../common/NodeShell";
import {
  USE_DEF_ARGUMENT_BACKGROUND,
  USE_DEF_ARGUMENT_BORDER_COLOR,
  USE_DEF_EXTERNAL_BACKGROUND,
  USE_DEF_EXTERNAL_BORDER_COLOR,
  USE_DEF_VALUE_BORDER_RADIUS,
} from "./useDefStyleConstants";

/**
 * Value source node of the Use-Def view (specs/llvm-use-def-view.md §2.2):
 * a function argument, or an "external" name with no visible def. Rendered
 * as a pill, styled per kind so a dangling reference is visibly not a
 * parameter; edges leave from NodeShell's bottom source handle.
 */
const LLVMUseDefValueNode = ({ data }: NodeProps) => {
  const value = data.astData as LLVMUseDefValueData;
  const isArgument = value.kind === "argument";
  const text = value.paramType
    ? `%${value.name}: ${value.paramType}`
    : `%${value.name}`;

  return (
    <NodeShell
      borderRadius={`${USE_DEF_VALUE_BORDER_RADIUS}px`}
      borderColor={
        isArgument
          ? USE_DEF_ARGUMENT_BORDER_COLOR
          : USE_DEF_EXTERNAL_BORDER_COLOR
      }
      backgroundColor={
        isArgument ? USE_DEF_ARGUMENT_BACKGROUND : USE_DEF_EXTERNAL_BACKGROUND
      }
      wrap={false}
      style={{ whiteSpace: "pre", textAlign: "center" }}
    >
      {text}
    </NodeShell>
  );
};

export default LLVMUseDefValueNode;
