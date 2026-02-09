import type { NodeDefGroup } from "./types";

import LLVMBasicBlockNode from "../../components/Graph/LLVM/LLVMBasicBlockNode";
import LLVMFunctionHeaderNode from "../../components/Graph/LLVM/LLVMFunctionHeaderNode";
import LLVMGlobalVariableNode from "../../components/Graph/LLVM/LLVMGlobalVariableNode";
import LLVMAttributeGroupNode from "../../components/Graph/LLVM/LLVMAttributeGroupNode";
import LLVMMetadataNode from "../../components/Graph/LLVM/LLVMMetadataNode";
import LLVMDeclarationNode from "../../components/Graph/LLVM/LLVMDeclarationNode";
import LLVMExitNode from "../../components/Graph/LLVM/LLVMExitNode";

export const llvmNodeGroup: NodeDefGroup = {
  nodeTypes: {
    llvmBasicBlock: LLVMBasicBlockNode,
    llvmFunctionHeader: LLVMFunctionHeaderNode,
    llvmGlobalVariable: LLVMGlobalVariableNode,
    llvmAttributeGroup: LLVMAttributeGroupNode,
    llvmMetadata: LLVMMetadataNode,
    llvmDeclaration: LLVMDeclarationNode,
    llvmExit: LLVMExitNode,
  },
  defs: [
    {
      title: "LLVM BasicBlock",
      nodeType: "llvmBasicBlock",
      astData: {
        type: "BasicBlock",
        id: "bb0",
        label: "entry",
        instructions: [
          {
            type: "Instruction",
            originalText: "%2 = add i32 %0, %1",
            opcode: "generic",
            operands: [],
          },
          {
            type: "Instruction",
            originalText: "%3 = mul i32 %2, 2",
            opcode: "generic",
            operands: [],
          },
        ],
        terminator: {
          type: "Instruction",
          originalText: "ret i32 %3",
          opcode: "ret",
        },
      },
    },
    {
      title: "LLVM FunctionHeader",
      nodeType: "llvmFunctionHeader",
      astData: {
        name: "@main",
        definition: "define i32 @main(i32 %0, i8** %1)",
      },
    },
    {
      title: "LLVM GlobalVariable",
      nodeType: "llvmGlobalVariable",
      astData: {
        type: "GlobalVariable",
        name: "@global_str",
        value: '@global_str = private constant [14 x i8] c"Hello, World!\\00"',
        originalText:
          '@global_str = private constant [14 x i8] c"Hello, World!\\00"',
      },
    },
    {
      title: "LLVM Declaration",
      nodeType: "llvmDeclaration",
      astData: {
        type: "Declaration",
        name: "@printf",
        definition: "declare i32 @printf(i8*, ...)",
      },
    },
    {
      title: "LLVM Exit",
      nodeType: "llvmExit",
      astData: {},
    },
    {
      title: "LLVM AttributeGroup",
      nodeType: "llvmAttributeGroup",
      astData: {
        type: "AttributeGroup",
        id: "0",
        value:
          'attributes #0 = { noinline nounwind optnone uwtable "frame-pointer"="all" }',
        originalText:
          'attributes #0 = { noinline nounwind optnone uwtable "frame-pointer"="all" }',
      },
    },
    {
      title: "LLVM Metadata",
      nodeType: "llvmMetadata",
      astData: {
        type: "Metadata",
        id: "!0",
        value: '!0 = !{i32 1, !"wchar_size", i32 4}',
        originalText: '!0 = !{i32 1, !"wchar_size", i32 4}',
      },
    },
  ],
};
