import * as ohm from 'ohm-js';
import llvmGrammar from './llvm.ohm?raw';
import type { GraphData, GraphNode, GraphEdge } from '../types/graph';
import type { LLVMModule, LLVMFunction, LLVMBasicBlock, LLVMInstruction } from './llvmAST';

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
                definition: definition
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
        Param(typeNode: any, _attrs: any, val: any) {
            return {
                type: typeNode.sourceString,
                name: val.numChildren > 0 ? val.children[0].sourceString : null
            };
        },
        ParamAttr(_id: any) {
            return this.sourceString;
        },
        EntryBasicBlock(labelOpt: any, instructions: any, terminator: any) {
            const labelNode = labelOpt.numChildren > 0 ? labelOpt.children[0].toAST() : null;
            const instNodes: LLVMInstruction[] = instructions.children.map((i: any) => i.toAST());
            const termNode: LLVMInstruction = terminator.toAST();
            const allInstructions = [...instNodes, termNode];

            return {
                type: 'BasicBlock',
                id: labelNode || '',
                label: labelNode,
                instructions: allInstructions
            } as LLVMBasicBlock;
        },
        BasicBlock(label: any, instructions: any, terminator: any) {
            const labelNode = label.toAST();
            const instNodes: LLVMInstruction[] = instructions.children.map((i: any) => i.toAST());
            const termNode: LLVMInstruction = terminator.toAST();
            const allInstructions = [...instNodes, termNode];

            return {
                type: 'BasicBlock',
                id: labelNode,
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
        const entryId = 'entry';

        // Entry Node
        nodes.push({
            id: entryId,
            label: func.definition || `define ${func.name} (...)`,
            type: 'round',
            language: 'llvm'
        });

        const blocks = func.blocks;
        let firstBlockId: string | null = null;

        blocks.forEach((block, index) => {
            const blockId = block.id || `${func.name}_blk_${index}`;
            if (index === 0) firstBlockId = blockId;

            const codeContent = block.instructions.map(i => i.originalText).join('\n');

            nodes.push({
                id: blockId,
                label: codeContent,
                blockLabel: block.label || undefined,
                type: 'square',
                language: 'llvm'
            });

            if (block.instructions.length > 0) {
                const lastInst = block.instructions[block.instructions.length - 1];

                if (lastInst.opcode === 'br') {
                    const text = lastInst.originalText;

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
