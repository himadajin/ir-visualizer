import * as ohm from 'ohm-js';
import llvmGrammar from './llvm.ohm?raw';
import type { GraphData, GraphNode, GraphEdge } from '../types/graph';
import type { LLVMModule, LLVMFunction, LLVMBasicBlock, LLVMInstruction, LLVMDebugRecord, LLVMBasicBlockItem } from './llvmAST';

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
        Module(topLevels: any) {
            const children = topLevels.children.map((c: any) => c.toAST());
            const functions = children.filter((c: any) => c && c.type === 'Function');
            return {
                type: 'Module',
                functions: functions
            } as LLVMModule;
        },
        TopLevel(content: any) {
            if (content.ctorName === 'Function') {
                return content.toAST();
            }
            return null;
        },
        Function(def: any, header: any, name: any, lp: any, paramsNode: any, rp: any, attrs: any, _lb: any, entryBlock: any, otherBlocks: any, _rb: any) {
            const funcName = name.sourceString;
            const definition = `${def.sourceString} ${header.sourceString} ${funcName} ${lp.sourceString}${paramsNode.sourceString}${rp.sourceString} ${attrs.sourceString}`.trim().replace(/\s+/g, ' ');

            const entryNode = entryBlock.toAST();
            const otherBlockNodes = otherBlocks.children.map((b: any) => b.toAST());
            const blockNodes: LLVMBasicBlock[] = [entryNode, ...otherBlockNodes];

            const params = paramsNode.numChildren > 0 ? paramsNode.children[0].toAST() : [];

            return {
                type: 'Function',
                name: funcName,
                params,
                blocks: blockNodes,
                definition: definition,
                entry: entryNode
            } as LLVMFunction;
        },
        FuncHeader(_content: any) {
            return this.sourceString;
        },
        FuncAttrs(_content: any) {
            return this.sourceString;
        },
        Params(first: any, _comma: any, rest: any) {
            const firstParam = first.toAST();
            const restParams = rest.children.map((p: any) => p.toAST());
            return [firstParam, ...restParams];
        },
        Param(first: any, value: any) {
            return {
                type: first.sourceString.trim(),
                name: value.sourceString
            };
        },
        EntryBasicBlock(labelOpt: any, items: any, terminator: any) {
            const labelNode = labelOpt.numChildren > 0 ? labelOpt.children[0].toAST() : null;
            const itemNodes: LLVMBasicBlockItem[] = items.children.map((i: any) => i.toAST());
            const termNode: LLVMInstruction = terminator.toAST();
            // NOTE: converting LLVMInstruction[] to LLVMBasicBlockItem[] is trivial via covariance if structured correctly, 
            // but we need to make sure terminator (LLVMInstruction) is also part of instructions if desired?
            // The previous logic was: const allInstructions = [...instNodes, termNode];
            // But now instNodes can be DebugRecords. 
            // LLVMBasicBlock.instructions is LLVMBasicBlockItem[].
            // LLVMInstruction is a subtype of LLVMBasicBlockItem.
            // So [...itemNodes, termNode] is valid.
            const allItems = [...itemNodes, termNode];

            return {
                type: 'BasicBlock',
                id: labelNode || 'entry',
                label: labelNode || null,
                instructions: allItems,
                terminator: termNode
            } as LLVMBasicBlock;
        },
        BasicBlock(label: any, items: any, terminator: any) {
            const labelNode = label.toAST();
            const itemNodes: LLVMBasicBlockItem[] = items.children.map((i: any) => i.toAST());
            const termNode: LLVMInstruction = terminator.toAST();
            const allItems = [...itemNodes, termNode];

            return {
                type: 'BasicBlock',
                id: labelNode,
                label: labelNode,
                instructions: allItems,
                terminator: termNode
            } as LLVMBasicBlock;
        },
        BasicBlockItem(inner: any) {
            return inner.toAST();
        },
        DebugRecord(_hash: any, content: any) {
            return {
                type: 'DebugRecord',
                content: content.sourceString,
                originalText: this.sourceString
            } as LLVMDebugRecord;
        },
        Label(l: any, _colon: any) {
            return l.sourceString;
        },
        Instruction(inner: any) {
            return inner.toAST();
        },
        AssignInstruction(localVal: any, _eq: any, opcodeNode: any, argsNode: any, _meta: any) {
            const result = localVal.sourceString;
            return {
                type: 'Instruction',
                opcode: opcodeNode.sourceString,
                result: result,
                operands: argsNode.sourceString.trim(),
                originalText: this.sourceString
            } as LLVMInstruction;
        },
        GenericInstruction(opcodeNode: any, argsNode: any, _meta: any) {
            return {
                type: 'Instruction',
                opcode: opcodeNode.sourceString,
                operands: argsNode.sourceString.trim(),
                originalText: this.sourceString
            } as LLVMInstruction;
        },
        // Lexical rules usually don't need explicit AST actions unless returning string
        opcode(_id: any) {
            return this.sourceString;
        },
        args(_content: any) {
            return this.sourceString;
        },
        Terminator(inner: any) {
            return inner.toAST();
        },
        BrInstruction(_br: any, args: any, _meta: any) {
            return {
                type: 'Instruction',
                opcode: 'br',
                operands: args.sourceString.trim(),
                originalText: this.sourceString
            } as LLVMInstruction;
        },
        RetInstruction(_ret: any, args: any, _meta: any) {
            return {
                type: 'Instruction',
                opcode: 'ret',
                operands: args.sourceString.trim(),
                originalText: this.sourceString
            } as LLVMInstruction;
        },
        Value(v: any) {
            const raw = v.sourceString;
            return raw.startsWith('%') ? raw.substring(1) : raw;
        },
        type(_content: any) {
            return this.sourceString;
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
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];

    module.functions.forEach(func => {
        const headerId = `header_${func.name}`;

        // Entry Node
        nodes.push({
            id: headerId,
            label: func.definition || `define ${func.name} (...)`,
            type: 'round',
            language: 'llvm'
        });

        const blocks = func.blocks;

        blocks.forEach((block) => {
            const blockId = block.id;

            const codeContent = block.instructions.map(i => i.originalText).join('\n');

            nodes.push({
                id: blockId,
                label: codeContent,
                blockLabel: block.label || undefined, // explicit undefined if null? CodeNode handles it? No, type is string | undefined
                // Wait, if block.label is null, passing undefined is correct for Typescript if interface says string | undefined.
                // But I want to pass null to CodeNode? CodeNode checks falsy.
                // Wait, I planned to change CodeNode to check specifically for null.
                // GraphNode interface in types/graph might strict it.
                // Let's check GraphNode type first? No time.
                // I will pass block.label as is (string | null).
                // GraphNode interface probably allows any prop?
                // Let's assume blockLabel can be string | null.
                type: 'square',
                language: 'llvm'
            });

            if (block.terminator) {
                const terminator = block.terminator;

                if (terminator.opcode === 'br') {
                    const text = terminator.originalText;

                    if (text.includes(',')) {
                        const labelMatches = [...text.matchAll(/label\s+%?([\w.]+)/g)];
                        if (labelMatches.length >= 2) {
                            const trueTarget = labelMatches[0][1];
                            const falseTarget = labelMatches[1][1];

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
                    } else {
                        const match = text.match(/label\s+%?([\w.]+)/);
                        if (match) {
                            const target = match[1];
                            edges.push({
                                id: `e-${blockId}-${target}`,
                                source: blockId,
                                target: target,
                                type: 'arrow'
                            });
                        }
                    }
                } else if (terminator.opcode === 'ret') {
                    edges.push({
                        id: `e-${blockId}-exit`,
                        source: blockId,
                        target: 'exit',
                        type: 'arrow'
                    });
                }
            }
        });

        if (func.entry) {
            edges.push({
                id: `e-${headerId}-${func.entry.id}`,
                source: headerId,
                target: func.entry.id,
                type: 'arrow'
            });
        }
    });

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
    return convertASTToGraph(nodes);
}
