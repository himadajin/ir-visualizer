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
            const children = topLevels.children.map((c: any) => c.toAST()).filter((c: any) => c !== null);
            return {
                type: 'Module',
                functions: children.filter((c: any) => c && c.type === 'Function'),
                globalVariables: children.filter((c: any) => c && c.type === 'GlobalVariable'),
                attributes: children.filter((c: any) => c && c.type === 'AttributeGroup'),
                metadata: children.filter((c: any) => c && c.type === 'Metadata'),
                declarations: children.filter((c: any) => c && c.type === 'Declaration'),
                targets: children.filter((c: any) => c && c.type === 'Target'),
            } as LLVMModule;
        },
        TopLevel(content: any) {
            return content.toAST();
        },
        EmptyLine(_space: any) {
            return null;
        },
        Function(def: any, header: any, name: any, lp: any, paramsNode: any, rp: any, attrs: any, _lb: any, entryBlock: any, otherBlocks: any, _rb: any) {
            const funcName = name.sourceString;
            // Handle optional attrs (Ohm ? produces empty list or result)
            const attrsStr = attrs.numChildren > 0 ? attrs.sourceString : '';
            const definition = `${def.sourceString} ${header.sourceString} ${funcName} ${lp.sourceString}${paramsNode.sourceString}${rp.sourceString} ${attrsStr}`.trim().replace(/\s+/g, ' ');

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
        Declaration(_declare: any, rest: any) {
            return {
                type: 'Declaration',
                name: 'declaration', // We could parse declaration name if needed, but for now just stashing text
                definition: this.sourceString.trim()
            };
        },
        GlobalAssignment(name: any, _eq: any, _rest: any) {
            const gName = name.sourceString;
            const fullText = this.sourceString;
            const value = fullText.substring(fullText.indexOf('=') + 1).trim();
            return {
                type: 'GlobalVariable',
                name: gName,
                value: value,
                originalText: fullText
            };
        },
        AttributeDef(_attr: any, id: any, _eq: any, _rest: any) {
            return {
                type: 'AttributeGroup',
                id: id.sourceString,
                value: this.sourceString.substring(this.sourceString.indexOf('=') + 1).trim(),
                originalText: this.sourceString
            };
        },
        MetadataDef(id: any, _eq: any, _rest: any) {
            return {
                type: 'Metadata',
                id: id.sourceString,
                value: this.sourceString.substring(this.sourceString.indexOf('=') + 1).trim(),
                originalText: this.sourceString
            };
        },
        TargetDef(target: any, _rest: any) {
            return {
                type: 'Target',
                key: target.sourceString,
                value: this.sourceString.trim()
            };
        },
        TypeAlias(name: any, _eq: any, _type: any, _rest: any) {
            // Treat as global var for now or ignore? 
            // Maybe ignore for graph visualization unless requested.
            return null;
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

    // Helper to generate unique IDs if necessary
    const uniqueId = (prefix: string, name: string) => `${prefix}_${name.replace(/[@%"]/g, '')}`;

    // 1. Process Global Variables
    if (module.globalVariables) {
        module.globalVariables.forEach(gVar => {
            nodes.push({
                id: uniqueId('global', gVar.name),
                label: gVar.originalText,
                type: 'square',
                language: 'llvm'
            });
        });
    }

    // 2. Process Functions
    module.functions.forEach(func => {
        // Namespace function blocks to avoid collisions if multiple functions use same labels (e.g. "entry")
        // Although LLVM IR usually has implicit or explicit numbering that prevents simple clashes,
        // separate functions definitely have separate scopes.
        const funcPrefix = uniqueId('func', func.name);
        const headerId = `${funcPrefix}_header`;

        // Entry Node
        nodes.push({
            id: headerId,
            label: func.definition || `define ${func.name} (...)`,
            type: 'round',
            language: 'llvm'
        });

        const blocks = func.blocks;

        blocks.forEach((block) => {
            // Block IDs need to be scoped to function because 'entry' or numbered blocks '%1' repeat across functions.
            // Using a composite ID: funcName_blockName
            const rawBlockId = block.id;
            // block.id comes from Label rule (ident) or 'entry'. 
            // If it's a numeric label from source (like "4:"), ohm might capture "4".
            const blockId = `${funcPrefix}_block_${rawBlockId}`;

            const codeContent = block.instructions.map(i => i.originalText).join('\n');

            nodes.push({
                id: blockId,
                label: codeContent,
                blockLabel: block.label || undefined,
                type: 'square',
                language: 'llvm'
            });

            if (block.terminator) {
                const terminator = block.terminator;

                if (terminator.opcode === 'br') {
                    const text = terminator.operands;

                    if (text.includes(',')) {
                        const labelMatches = [...text.matchAll(/label\s+%?([\w.]+)/g)];
                        if (labelMatches.length >= 2) {
                            const trueTarget = labelMatches[0][1];
                            const falseTarget = labelMatches[1][1];

                            const trueId = `${funcPrefix}_block_${trueTarget}`;
                            const falseId = `${funcPrefix}_block_${falseTarget}`;

                            edges.push({
                                id: `e-${blockId}-${trueId}-true`,
                                source: blockId,
                                target: trueId,
                                label: 'true',
                                type: 'arrow' // Using 'arrow' as standard edge
                            });
                            edges.push({
                                id: `e-${blockId}-${falseId}-false`,
                                source: blockId,
                                target: falseId,
                                label: 'false',
                                type: 'arrow'
                            });
                        }
                    } else {
                        const match = text.match(/label\s+%?([\w.]+)/);
                        if (match) {
                            const target = match[1];
                            const targetId = `${funcPrefix}_block_${target}`;
                            edges.push({
                                id: `e-${blockId}-${targetId}`,
                                source: blockId,
                                target: targetId,
                                type: 'arrow'
                            });
                        }
                    }
                } else if (terminator.opcode === 'ret') {
                    // Unique exit per function? Or shared exit?
                    // Typically CFG has unique exit per function.
                    const exitId = `${funcPrefix}_exit`;

                    // Check if exit node exists for this function, if not add it
                    if (!nodes.find(n => n.id === exitId)) {
                        nodes.push({
                            id: exitId,
                            label: 'exit',
                            type: 'round', // Exit is usually round
                            language: 'text'
                        });
                    }

                    edges.push({
                        id: `e-${blockId}-${exitId}`,
                        source: blockId,
                        target: exitId,
                        type: 'arrow'
                    });
                }
            }
        });

        if (func.entry) {
            const entryBlockId = `${funcPrefix}_block_${func.entry.id}`;
            edges.push({
                id: `e-${headerId}-${entryBlockId}`,
                source: headerId,
                target: entryBlockId,
                type: 'arrow'
            });
        }
    });

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
