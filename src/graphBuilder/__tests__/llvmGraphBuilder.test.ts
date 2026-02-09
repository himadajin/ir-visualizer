import { describe, it, expect } from "vitest";
import { convertASTToGraph } from "../llvmGraphBuilder";
import type {
  LLVMModule,
  LLVMFunction,
  LLVMBasicBlock,
  LLVMBrInstruction,
  LLVMRetInstruction,
  LLVMSwitchInstruction,
  LLVMGenericInstruction,
} from "../../ast/llvmAST";

/** Helper: create a minimal LLVMModule for testing */
function createModule(overrides: Partial<LLVMModule> = {}): LLVMModule {
  return {
    type: "Module",
    functions: [],
    globalVariables: [],
    attributes: [],
    metadata: [],
    declarations: [],
    targets: [],
    sourceFilenames: [],
    ...overrides,
  };
}

function createRetTerminator(): LLVMRetInstruction {
  return {
    type: "Instruction",
    opcode: "ret",
    valType: "void",
    originalText: "ret void",
  };
}

function createBlock(
  id: string,
  terminator: LLVMBrInstruction | LLVMRetInstruction | LLVMSwitchInstruction,
  instructions: LLVMGenericInstruction[] = [],
): LLVMBasicBlock {
  return {
    type: "BasicBlock",
    id,
    label: id,
    instructions: [...instructions, terminator],
    terminator,
  };
}

function createFunction(name: string, blocks: LLVMBasicBlock[]): LLVMFunction {
  return {
    type: "Function",
    name,
    params: [],
    blocks,
    definition: `define void @${name}()`,
    entry: blocks[0],
  };
}

describe("LLVM convertASTToGraph", () => {
  describe("function with single block + ret", () => {
    it("should create function header, basic block, exit node, and edges", () => {
      const retBlock = createBlock("entry", createRetTerminator());
      const func = createFunction("main", [retBlock]);
      const module = createModule({ functions: [func] });

      const graph = convertASTToGraph(module);

      // Nodes: function header + basic block + exit
      expect(graph.nodes).toHaveLength(3);

      const header = graph.nodes.find(
        (n) => n.nodeType === "llvm-functionHeader",
      );
      expect(header).toBeDefined();
      expect(header?.label).toContain("main");

      const block = graph.nodes.find((n) => n.nodeType === "llvm-basicBlock");
      expect(block).toBeDefined();

      const exit = graph.nodes.find((n) => n.nodeType === "llvm-exit");
      expect(exit).toBeDefined();
      expect(exit?.label).toBe("exit");

      // Edges: header->entry, entry->exit
      expect(graph.edges).toHaveLength(2);

      // Direction should be TD
      expect(graph.direction).toBe("TD");
    });
  });

  describe("conditional branch", () => {
    it("should create two edges for conditional br", () => {
      const brInstr: LLVMBrInstruction = {
        type: "Instruction",
        opcode: "br",
        condition: "cond",
        trueTarget: "then",
        falseTarget: "else",
        originalText: "br i1 %cond, label %then, label %else",
      };

      const entryBlock = createBlock("entry", brInstr);
      const thenBlock = createBlock("then", createRetTerminator());
      const elseBlock = createBlock("else", createRetTerminator());
      const func = createFunction("foo", [entryBlock, thenBlock, elseBlock]);
      const module = createModule({ functions: [func] });

      const graph = convertASTToGraph(module);

      // Find edges from entry block
      const entryBlockId = graph.nodes.find(
        (n) => n.nodeType === "llvm-basicBlock" && n.id.includes("entry"),
      )?.id;
      expect(entryBlockId).toBeDefined();

      const edgesFromEntry = graph.edges.filter(
        (e) => e.source === entryBlockId,
      );
      expect(edgesFromEntry).toHaveLength(2);

      const trueEdge = edgesFromEntry.find((e) => e.label === "true");
      const falseEdge = edgesFromEntry.find((e) => e.label === "false");
      expect(trueEdge).toBeDefined();
      expect(falseEdge).toBeDefined();
      expect(trueEdge?.target).toContain("then");
      expect(falseEdge?.target).toContain("else");
    });
  });

  describe("unconditional branch", () => {
    it("should create one edge for unconditional br", () => {
      const brInstr: LLVMBrInstruction = {
        type: "Instruction",
        opcode: "br",
        destination: "next",
        originalText: "br label %next",
      };

      const entryBlock = createBlock("entry", brInstr);
      const nextBlock = createBlock("next", createRetTerminator());
      const func = createFunction("foo", [entryBlock, nextBlock]);
      const module = createModule({ functions: [func] });

      const graph = convertASTToGraph(module);

      const entryBlockId = graph.nodes.find(
        (n) => n.nodeType === "llvm-basicBlock" && n.id.includes("entry"),
      )?.id;

      const edgesFromEntry = graph.edges.filter(
        (e) => e.source === entryBlockId,
      );
      expect(edgesFromEntry).toHaveLength(1);
      expect(edgesFromEntry[0].target).toContain("next");
      expect(edgesFromEntry[0].label).toBeUndefined();
    });
  });

  describe("switch instruction", () => {
    it("should create edges for default and each case", () => {
      const switchInstr: LLVMSwitchInstruction = {
        type: "Instruction",
        opcode: "switch",
        conditionType: "i32",
        conditionValue: "val",
        defaultTarget: "default",
        cases: [
          { type: "i32", value: "0", target: "case0" },
          { type: "i32", value: "1", target: "case1" },
        ],
        originalText:
          "switch i32 %val, label %default [ i32 0, label %case0 i32 1, label %case1 ]",
      };

      const entryBlock = createBlock("entry", switchInstr);
      const case0 = createBlock("case0", createRetTerminator());
      const case1 = createBlock("case1", createRetTerminator());
      const defaultBlock = createBlock("default", createRetTerminator());
      const func = createFunction("foo", [
        entryBlock,
        case0,
        case1,
        defaultBlock,
      ]);
      const module = createModule({ functions: [func] });

      const graph = convertASTToGraph(module);

      const entryBlockId = graph.nodes.find(
        (n) =>
          n.nodeType === "llvm-basicBlock" && n.id.includes("_block_entry"),
      )?.id;

      const edgesFromEntry = graph.edges.filter(
        (e) => e.source === entryBlockId,
      );
      // 1 default + 2 cases = 3
      expect(edgesFromEntry).toHaveLength(3);

      const defaultEdge = edgesFromEntry.find((e) => e.label === "default");
      expect(defaultEdge).toBeDefined();
      expect(defaultEdge?.target).toContain("default");

      const case0Edge = edgesFromEntry.find((e) => e.label === "0");
      expect(case0Edge).toBeDefined();

      const case1Edge = edgesFromEntry.find((e) => e.label === "1");
      expect(case1Edge).toBeDefined();
    });
  });

  describe("global variables", () => {
    it("should create nodes for global variables", () => {
      const module = createModule({
        globalVariables: [
          {
            type: "GlobalVariable",
            name: "g",
            value: "global i32 42",
            originalText: "@g = global i32 42",
          },
        ],
      });

      const graph = convertASTToGraph(module);

      const globalNode = graph.nodes.find(
        (n) => n.nodeType === "llvm-globalVariable",
      );
      expect(globalNode).toBeDefined();
      expect(globalNode?.label).toBe("@g = global i32 42");
    });
  });

  describe("declarations", () => {
    it("should create nodes for declarations", () => {
      const module = createModule({
        declarations: [
          {
            type: "Declaration",
            name: "printf",
            definition: "declare void @printf()",
          },
        ],
      });

      const graph = convertASTToGraph(module);

      const declNode = graph.nodes.find(
        (n) => n.nodeType === "llvm-declaration",
      );
      expect(declNode).toBeDefined();
      expect(declNode?.label).toBe("declare void @printf()");
    });
  });

  describe("attributes", () => {
    it("should create nodes for attribute groups", () => {
      const module = createModule({
        attributes: [
          {
            type: "AttributeGroup",
            id: "#0",
            value: "{ nounwind }",
            originalText: "attributes #0 = { nounwind }",
          },
        ],
      });

      const graph = convertASTToGraph(module);

      const attrNode = graph.nodes.find(
        (n) => n.nodeType === "llvm-attributeGroup",
      );
      expect(attrNode).toBeDefined();
    });
  });

  describe("metadata", () => {
    it("should create nodes for metadata", () => {
      const module = createModule({
        metadata: [
          {
            type: "Metadata",
            id: "!0",
            value: "!{i32 1}",
            originalText: "!0 = !{i32 1}",
          },
        ],
      });

      const graph = convertASTToGraph(module);

      const metaNode = graph.nodes.find((n) => n.nodeType === "llvm-metadata");
      expect(metaNode).toBeDefined();
    });
  });

  describe("multiple functions", () => {
    it("should namespace block IDs to avoid collisions", () => {
      const func1 = createFunction("foo", [
        createBlock("entry", createRetTerminator()),
      ]);
      const func2 = createFunction("bar", [
        createBlock("entry", createRetTerminator()),
      ]);
      const module = createModule({ functions: [func1, func2] });

      const graph = convertASTToGraph(module);

      // Both functions have "entry" blocks but IDs should be different
      const entryBlocks = graph.nodes.filter(
        (n) => n.nodeType === "llvm-basicBlock" && n.id.includes("entry"),
      );
      expect(entryBlocks).toHaveLength(2);
      expect(entryBlocks[0].id).not.toBe(entryBlocks[1].id);
      expect(entryBlocks[0].id).toContain("foo");
      expect(entryBlocks[1].id).toContain("bar");
    });
  });

  describe("exit node deduplication", () => {
    it("should create only one exit node per function even with multiple ret blocks", () => {
      const block1 = createBlock("then", createRetTerminator());
      const block2 = createBlock("else", createRetTerminator());
      const brInstr: LLVMBrInstruction = {
        type: "Instruction",
        opcode: "br",
        condition: "c",
        trueTarget: "then",
        falseTarget: "else",
        originalText: "br i1 %c, label %then, label %else",
      };
      const entryBlock = createBlock("entry", brInstr);

      const func = createFunction("foo", [entryBlock, block1, block2]);
      const module = createModule({ functions: [func] });

      const graph = convertASTToGraph(module);

      const exitNodes = graph.nodes.filter((n) => n.nodeType === "llvm-exit");
      // Only one exit node per function
      expect(exitNodes).toHaveLength(1);
    });
  });

  describe("header to entry edge", () => {
    it("should connect function header to the entry block", () => {
      const func = createFunction("main", [
        createBlock("entry", createRetTerminator()),
      ]);
      const module = createModule({ functions: [func] });

      const graph = convertASTToGraph(module);

      const header = graph.nodes.find(
        (n) => n.nodeType === "llvm-functionHeader",
      );
      const entryBlock = graph.nodes.find(
        (n) => n.nodeType === "llvm-basicBlock",
      );

      const headerToEntry = graph.edges.find(
        (e) => e.source === header?.id && e.target === entryBlock?.id,
      );
      expect(headerToEntry).toBeDefined();
    });
  });
});
