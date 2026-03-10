import { describe, expect, it } from "vitest";
import {
  NODE_CATEGORY_COLORS,
  classifySelectionDAGNode,
  getSelectionDAGNodeColor,
} from "../selectionDAGNodeColor";

describe("classifySelectionDAGNode", () => {
  describe("exact match", () => {
    it('classifies "EntryToken" as entryToken', () => {
      expect(classifySelectionDAGNode("EntryToken")).toBe("entryToken");
    });

    it('classifies "TokenFactor" as tokenFactor', () => {
      expect(classifySelectionDAGNode("TokenFactor")).toBe("tokenFactor");
    });

    it('classifies "CopyFromReg" as register', () => {
      expect(classifySelectionDAGNode("CopyFromReg")).toBe("register");
    });

    it('classifies "CopyToReg" as register', () => {
      expect(classifySelectionDAGNode("CopyToReg")).toBe("register");
    });
  });

  describe("structural pattern — targetSpecific", () => {
    it('classifies "RISCVISD::RET_GLUE" as targetSpecific', () => {
      expect(classifySelectionDAGNode("RISCVISD::RET_GLUE")).toBe(
        "targetSpecific",
      );
    });

    it('classifies "X86ISD::RET" as targetSpecific', () => {
      expect(classifySelectionDAGNode("X86ISD::RET")).toBe("targetSpecific");
    });
  });

  describe("memory — case insensitive exact match", () => {
    it('classifies "load" as memory', () => {
      expect(classifySelectionDAGNode("load")).toBe("memory");
    });

    it('classifies "store" as memory', () => {
      expect(classifySelectionDAGNode("store")).toBe("memory");
    });

    it('classifies "Load" as memory', () => {
      expect(classifySelectionDAGNode("Load")).toBe("memory");
    });

    it('classifies "STORE" as memory', () => {
      expect(classifySelectionDAGNode("STORE")).toBe("memory");
    });
  });

  describe("partial match exclusion", () => {
    it('classifies "preload" as default (not memory)', () => {
      expect(classifySelectionDAGNode("preload")).toBe("default");
    });

    it('classifies "stored" as default (not memory)', () => {
      expect(classifySelectionDAGNode("stored")).toBe("default");
    });
  });

  describe("default", () => {
    it('classifies "add" as default', () => {
      expect(classifySelectionDAGNode("add")).toBe("default");
    });

    it('classifies "Constant" as default', () => {
      expect(classifySelectionDAGNode("Constant")).toBe("default");
    });

    it('classifies "" (empty string) as default', () => {
      expect(classifySelectionDAGNode("")).toBe("default");
    });

    it('classifies "<<custom op>>" as default', () => {
      expect(classifySelectionDAGNode("<<custom op>>")).toBe("default");
    });
  });
});

describe("getSelectionDAGNodeColor", () => {
  it("returns the entryToken color for EntryToken", () => {
    expect(getSelectionDAGNodeColor("EntryToken")).toBe(
      NODE_CATEGORY_COLORS.entryToken,
    );
  });

  it("returns the targetSpecific color for RISCVISD::RET_GLUE", () => {
    expect(getSelectionDAGNodeColor("RISCVISD::RET_GLUE")).toBe(
      NODE_CATEGORY_COLORS.targetSpecific,
    );
  });

  it("returns the default color for add", () => {
    expect(getSelectionDAGNodeColor("add")).toBe(NODE_CATEGORY_COLORS.default);
  });

  it("returns a non-empty hex color string", () => {
    const color = getSelectionDAGNodeColor("store");
    expect(color).toMatch(/^#[0-9a-fA-F]{6}$/);
  });
});
