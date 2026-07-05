import * as ohm from "ohm-js";

/**
 * Lazily compiles an Ohm grammar and registers its semantics on first use,
 * caching the result for subsequent calls. If compilation fails, the cache
 * is cleared so a later call retries instead of permanently wedging on a
 * stale failure. Shared by all three parsers (llvm.ts, mermaid.ts,
 * selectionDAG.ts) so they compile their grammar the same way.
 */
export function createLazyGrammar(
  grammarSource: string,
  registerSemantics: (semantics: ohm.Semantics) => void,
): () => { grammar: ohm.Grammar; semantics: ohm.Semantics } {
  let grammar: ohm.Grammar | null = null;
  let semantics: ohm.Semantics | null = null;

  return function getGrammarAndSemantics() {
    if (!grammar) {
      try {
        grammar = ohm.grammar(grammarSource);
        semantics = grammar.createSemantics();
        registerSemantics(semantics);
      } catch (error) {
        grammar = null;
        semantics = null;
        throw error;
      }
    }
    return { grammar, semantics: semantics! };
  };
}
