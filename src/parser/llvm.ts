import * as ohm from 'ohm-js';
import llvmGrammar from './llvm.ohm?raw';
import type { GraphData, GraphNode, GraphEdge } from '../types/graph';

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
    semantics.addOperation('parse', {
        Module(functions: any) {
            const graphs: GraphData[] = functions.children.map((f: any) => f.parse());
            // For simplicity, we merge all functions into one graph, 
            // though typically we might only want to view one.
            // Or the input only has one function as per prompt.
            const nodes = graphs.flatMap(g => g.nodes);
            const edges = graphs.flatMap(g => g.edges);
            return { direction: 'TD', nodes, edges };
        },
        Function(_def: any, _type: any, ident: any, _lp: any, _params: any, _rp: any, _lb: any, blocks: any, _rb: any) {
            const funcName = ident.sourceString;
            const entryId = 'entry';

            const nodes: GraphNode[] = [];
            const edges: GraphEdge[] = [];

            // Create Entry Node (Function Header)
            // We might want the header text. 
            // Since we are inside semantic action, getting exact text includes whitespace which is fine.
            // Constructing a "header" label manually might be cleaner.
            const headerLabel = `define ${funcName} (...)`;
            nodes.push({
                id: entryId,
                label: headerLabel,
                type: 'round',
                language: 'llvm'
            });

            const blockResults = blocks.children.map((b: any) => b.parse());

            let firstBlockId: string | null = null;

            blockResults.forEach((block: any, index: number) => {
                nodes.push(block.node);
                edges.push(...block.edges);

                if (index === 0) {
                    firstBlockId = block.node.id;
                }
            });

            if (firstBlockId) {
                edges.push({
                    id: `e - ${entryId} -${firstBlockId} `,
                    source: entryId,
                    target: firstBlockId!,
                    type: 'arrow'
                });
            }

            // Add implicit Exit node if needed?
            // Our 'ret' logic below handles edges to 'exit', so if any edge points to 'exit', we add the node.
            const hasExit = edges.some(e => e.target === 'exit');
            if (hasExit) {
                nodes.push({
                    id: 'exit',
                    label: 'exit',
                    type: 'round',
                    language: 'text'
                });
            }

            return { nodes, edges };
        },
        BasicBlock(labelOpt: any, instructions: any, terminator: any) {
            const labelNode = labelOpt.numChildren > 0 ? labelOpt.children[0].parse() : null;

            // Use label if exists, otherwise generate one? 
            // Or maybe input guarantees labels. 
            // If label is missing, strict graph requires ID. 
            // Let's assume unique IDs can be derived or prompt implies labels exist.
            // Prompt says "4: ...". 

            // NOTE: In our grammar, Label is "ident :".
            let blockId = labelNode ? labelNode.replace(':', '') : `block_${Math.random().toString(36).substr(2, 5)} `;
            // Clean up blockId (remove leading % if present in ident - grammar says ident includes % ?)
            // Grammar: ident = (letter | "@" | "%") ...
            // So ID could be "%4" or "4". 
            // Usually in LLVM IR, labels are "%4" or just "4" if numeric.

            const instText = instructions.sourceString.trim();
            const termResult = terminator.parse(); // { edges: [], text: ... }

            const fullLabel = (labelNode ? labelNode + '\n' : '') + instText + (instText ? '\n' : '') + termResult.text;

            const node: GraphNode = {
                id: blockId,
                label: fullLabel,
                type: 'square',
                language: 'llvm'
            };

            // Map terminator targets to edges starting from this block
            const edges: GraphEdge[] = termResult.targets.map((target: string, idx: number) => ({
                id: `e - ${blockId} -${target} -${idx} `,
                source: blockId,
                target: target,
                label: termResult.labels ? termResult.labels[idx] : undefined,
                type: 'arrow'
            }));

            return { node, edges };
        },
        Label(l: any, _colon: any) {
            return l.sourceString;
        },
        Terminator(inst: any) {
            return inst.parse();
        },
        BrCond(_br: any, _type: any, _cond: any, _c: any, _l1: any, targetTrue: any, _c2: any, _l2: any, targetFalse: any) {
            return {
                text: _br.sourceString + _type.sourceString + " " + _cond.sourceString + ", ...",
                targets: [targetTrue.parse(), targetFalse.parse()],
                labels: ['true', 'false']
            };
        },
        BrUncond(_br: any, _label: any, target: any) {
            return {
                text: _br.sourceString + " ...",
                targets: [target.parse()],
                labels: [undefined]
            };
        },
        Ret(_ret: any, _type: any, _val: any) {
            return {
                text: _ret.sourceString + " ...",
                targets: ['exit'],
                labels: [undefined]
            };
        },
        Value(v: any) {
            // Remove % if present for ID linking?
            // Prompt example: "br label %18" -> target is "18:"
            // So if value is "%18", we want "18".
            // If value is "4", we want "4".
            const raw = v.sourceString;
            return raw.startsWith('%') ? raw.substring(1) : raw;
        },
        _iter(...children: any[]) {
            return children.map(c => c.parse());
        },
        _terminal() {
            return this.sourceString;
        }
    });
}

export function parseLLVM(input: string): GraphData {
    const { grammar, semantics } = getGrammarAndSemantics();
    const match = grammar.match(input);
    if (match.failed()) {
        console.error('LLVM Parse Error:', match.message);
        throw new Error(match.message);
    }
    return semantics(match).parse();
}
