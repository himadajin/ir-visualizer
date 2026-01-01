import * as ohm from 'ohm-js';
import llvmGrammar from './llvm.ohm?raw';
import type { GraphData, GraphNode, GraphEdge } from '../types/graph';
import type { LLVMModule, LLVMFunction, LLVMBasicBlock, LLVMInstruction } from './ast';

let _grammar: ohm.Grammar | null = null;
let _semantics: ohm.Semantics | null = null;

function getGrammarAndSemantics() {
    if (!_grammar) {
        try {
            _grammar = ohm.grammar(llvmGrammar);
            _semantics = _grammar.createSemantics();
            registerSemantics(_semantics);
        } catch (error) {
            console.error("Failed to initialize LLVM grammar:", error);
            throw error;
        }
    }
    return { grammar: _grammar, semantics: _semantics! };
}

function registerSemantics(semantics: ohm.Semantics) {
    semantics.addOperation<any>('toAST', {
        Module(functions: any) {
            const funcNodes: LLVMFunction[] = functions.children.map((f: any) => f.toAST());
            return {
                type: 'Module',
                functions: funcNodes
            } as LLVMModule;
        },
        Function(_def: any, _type: any, ident: any, _lp: any, _paramsNode: any, _rp: any, _lb: any, blocks: any, _rb: any) {
            const funcName = ident.sourceString;
            const blockNodes: LLVMBasicBlock[] = blocks.children.map((b: any) => b.toAST());
            // Params parsing is not fully implemented in detail in grammar yet, effectively just consuming string
            const params: string[] = []; // Placeholder

            return {
                type: 'Function',
                name: funcName,
                params,
                blocks: blockNodes
            } as LLVMFunction;
        },
        BasicBlock(labelOpt: any, instructions: any, terminator: any) {
            const labelNode = labelOpt.numChildren > 0 ? labelOpt.children[0].toAST() : null;
            // Label comes with optional colon, we strip it in Label rule or here. 
            // In existing logic it was stripped in BasicBlock.

            const instNodes: LLVMInstruction[] = instructions.children.map((i: any) => i.toAST());
            const termNode: LLVMInstruction = terminator.toAST();

            const allInstructions = [...instNodes, termNode];

            // Resolve ID: use label if present, otherwise will be generated later or we can placeholder.
            // Actually, for AST we should probably just keep it as is.
            // The converting logic (topological check etc) might depend on stable IDs.
            // For now, if no label, we might need a temporary ID or just leave blank.
            // The original logic generated IDs: `${funcName}_blk_${index}` during Graph generation.
            // We can defer ID generation to Graph conversion for unnamed blocks, 
            // OR generate them here if we had index context (which we don't easily in Ohm).
            // Let's use label if available, otherwise empty string for now.
            const id = labelNode || '';

            return {
                type: 'BasicBlock',
                id,
                label: labelNode,
                instructions: allInstructions
            } as LLVMBasicBlock;
        },
        Label(l: any, _colon: any) {
            return l.sourceString;
        },
        Instruction(inner: any) {
            return inner.toAST();
        },
        AssignInstruction(_pct: any, _digit: any, _eq: any, invokeOp: any) {
            // Text: "%1 = add ..."
            // Result: "%1" (reconstructed from source) or just matched parts.
            // _pct + _digit is left side.
            const result = _pct.sourceString + _digit.sourceString;
            const rhs = invokeOp.sourceString.trim();
            const [opcode, ...operandsParts] = rhs.split(/\s+/);
            const operands = operandsParts.join(' ');

            return {
                type: 'Instruction',
                opcode: opcode,
                result: result,
                operands: operands,
                originalText: this.sourceString
            } as LLVMInstruction;
        },
        StoreInstruction(_store: any, invokeOp: any) {
            return {
                type: 'Instruction',
                opcode: 'store',
                operands: invokeOp.sourceString.trim(),
                originalText: this.sourceString
            } as LLVMInstruction;
        },
        CallInstruction(callKw: any, invokeOp: any) {
            return {
                type: 'Instruction',
                opcode: callKw.sourceString, // "call" or "tail call"
                operands: invokeOp.sourceString.trim(),
                originalText: this.sourceString
            } as LLVMInstruction;
        },
        GenericInstruction(_content: any) {
            const text = this.sourceString.trim();
            const [opcode, ...rest] = text.split(/\s+/);
            return {
                type: 'Instruction',
                opcode: opcode,
                operands: rest.join(' '),
                originalText: text
            } as LLVMInstruction;
        },
        Terminator(inner: any) {
            return inner.toAST();
        },
        BrCond(_br: any, _type: any, _cond: any, _c: any, _l1: any, _targetTrue: any, _c2: any, _l2: any, _targetFalse: any) {
            return {
                type: 'Instruction',
                opcode: 'br',
                operands: this.sourceString.substring(2).trim(), // remove "br"
                originalText: this.sourceString
            } as LLVMInstruction;
        },
        BrUncond(_br: any, _label: any, _target: any) {
            return {
                type: 'Instruction',
                opcode: 'br',
                operands: this.sourceString.substring(2).trim(),
                originalText: this.sourceString
            } as LLVMInstruction;
        },
        Ret(_ret: any, _type: any, _val: any) {
            return {
                type: 'Instruction',
                opcode: 'ret',
                operands: this.sourceString.substring(3).trim(),
                originalText: this.sourceString
            } as LLVMInstruction;
        },
        Value(v: any) {
            const raw = v.sourceString;
            return raw.startsWith('%') ? raw.substring(1) : raw;
        },
        _iter(...children: any[]) {
            return children.map(c => c.toAST());
        },
        _terminal() {
            return this.sourceString;
        }
    });
}

function convertASTToGraph(module: LLVMModule): GraphData {
    // Merge all functions into one graph as before
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];

    module.functions.forEach(func => {
        const entryId = 'entry'; // Unique per function? Assuming single function for now as per prompt context

        // Entry Node
        nodes.push({
            id: entryId,
            label: `define ${func.name} (...)`,
            type: 'round',
            language: 'llvm'
        });

        const blocks = func.blocks;
        let firstBlockId: string | null = null;

        blocks.forEach((block, index) => {
            // Deterministic ID if label missing
            const blockId = block.id || `${func.name}_blk_${index}`;

            if (index === 0) firstBlockId = blockId;

            // Construct Label from instructions
            // Note: We might want to filter out the 'terminator' from text if we want to mimic exact previous behavior?
            // Previous behavior: `data.instructions + (data.instructions ? '\n' : '') + data.terminator.text`
            // Here `block.instructions` includes terminator.
            // So just join `originalText`.
            const fullLabel = (block.label ? block.label + ':\n' : '') + block.instructions.map(i => i.originalText).join('\n');

            nodes.push({
                id: blockId,
                label: fullLabel,
                type: 'square',
                language: 'llvm'
            });

            // Parse terminators for edges
            // We look at the LAST instruction (usually). Or any terminator instruction?
            // Valid LLVM has terminator at end.
            if (block.instructions.length > 0) {
                const lastInst = block.instructions[block.instructions.length - 1];

                if (lastInst.opcode === 'br') {
                    // Need to parse targets.
                    // BrUncond: "br label %dest"
                    // BrCond: "br i1 %cond, label %true, label %false"

                    // Regex accounting for optional % and allowing . in identifiers
                    const labelRegexPart = '%?([\\w.]+)';
                    const uncondRegex = new RegExp(`br\\s+label\\s+${labelRegexPart}`);
                    const uncondMatch = lastInst.originalText.match(uncondRegex);

                    if (uncondMatch) {
                        const target = uncondMatch[1];
                        edges.push({
                            id: `e-${blockId}-${target}`,
                            source: blockId,
                            target: target,
                            type: 'arrow'
                        });
                    } else {
                        // BrCond
                        const condRegex = new RegExp(`br\\s+.*,\\s+label\\s+${labelRegexPart},\\s+label\\s+${labelRegexPart}`);
                        const condMatch = lastInst.originalText.match(condRegex);
                        if (condMatch) {
                            const trueTarget = condMatch[1];
                            const falseTarget = condMatch[2];

                            edges.push({
                                id: `e-${blockId}-${trueTarget}-true`,
                                source: blockId,
                                target: trueTarget,
                                label: 'true',
                                type: 'arrow'
                            });
                            edges.push({
                                id: `e-${blockId}-${falseTarget}-false`,
                                source: blockId,
                                target: falseTarget,
                                label: 'false',
                                type: 'arrow'
                            });
                        }
                    }
                } else if (lastInst.opcode === 'ret') {
                    edges.push({
                        id: `e-${blockId}-exit`,
                        source: blockId,
                        target: 'exit',
                        type: 'arrow'
                    });
                }
            }
        });

        if (firstBlockId) {
            edges.push({
                id: `e-${entryId}-${firstBlockId}`,
                source: entryId,
                target: firstBlockId!,
                type: 'arrow'
            });
        }
    });

    // Implicit Exit
    const hasExit = edges.some(e => e.target === 'exit');
    if (hasExit) {
        nodes.push({
            id: 'exit',
            label: 'exit',
            type: 'round',
            language: 'text'
        });
    }

    return { nodes, edges, direction: 'TD' };
}

export function parseLLVM(input: string): GraphData {
    const { grammar, semantics } = getGrammarAndSemantics();
    const match = grammar.match(input);
    if (match.failed()) {
        console.error('LLVM Parse Error:', match.message);
        throw new Error(match.message);
    }
    const nodes = semantics(match).toAST() as LLVMModule;
    // console.log("AST:", JSON.stringify(nodes, null, 2));
    return convertASTToGraph(nodes);
}
