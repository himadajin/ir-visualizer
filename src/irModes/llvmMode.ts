import { parseLLVM } from "../parser/llvm";
import { codeGraphEdgeBuilder } from "../utils/layout";
import LLVMBasicBlockNode from "../components/Graph/LLVM/LLVMBasicBlockNode";
import LLVMFunctionHeaderNode from "../components/Graph/LLVM/LLVMFunctionHeaderNode";
import LLVMGlobalVariableNode from "../components/Graph/LLVM/LLVMGlobalVariableNode";
import LLVMAttributeGroupNode from "../components/Graph/LLVM/LLVMAttributeGroupNode";
import LLVMMetadataNode from "../components/Graph/LLVM/LLVMMetadataNode";
import LLVMDeclarationNode from "../components/Graph/LLVM/LLVMDeclarationNode";
import LLVMExitNode from "../components/Graph/LLVM/LLVMExitNode";
import type { IRModeDefinition } from "./types";

const DEFAULT_CODE = `
define i32 @func(i32 %0, i32 %1, i1  %2) {
  br i1 %2, label %4, label %7

4:
  %5 = add i32 %0, 45
  %6 = add i32 %5, %1
  br label %18

7:
  %8 = icmp sgt i32 %1, 0
  br i1 %8, label %12, label %9

9:
  %10 = phi i32 [ %1, %7 ], [ %15, %12 ]
  %11 = sub i32 %10, %0
  br label %18

12:
  %13 = phi i32 [ %16, %12 ], [ 0, %7 ]
  %14 = phi i32 [ %15, %12 ], [ %1, %7 ]
  %15 = sub i32 %14, %13
  %16 = add i32 %13, %0
  %17 = icmp slt i32 %16, %15
  br i1 %17, label %12, label %9

18:
  %19 = phi i32 [ %6, %4 ], [ %11, %9 ]
  ret i32 %19
}
`;

export const llvmMode = {
  key: "llvm-ir" as const,
  label: "LLVM-IR",
  editorLanguage: "llvm",
  defaultCode: DEFAULT_CODE,
  parse: parseLLVM,
  nodeTypes: {
    llvmBasicBlock: LLVMBasicBlockNode,
    llvmFunctionHeader: LLVMFunctionHeaderNode,
    llvmGlobalVariable: LLVMGlobalVariableNode,
    llvmAttributeGroup: LLVMAttributeGroupNode,
    llvmMetadata: LLVMMetadataNode,
    llvmDeclaration: LLVMDeclarationNode,
    llvmExit: LLVMExitNode,
  },
  edgeBuilder: codeGraphEdgeBuilder,
} satisfies IRModeDefinition;
