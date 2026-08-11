import type { LanguageInput } from "shiki/core";

/**
 * The TextMate grammars this app ships, keyed by Monaco language id. One
 * declaration feeds every consumer — the shared highlighter
 * (`src/utils/highlighter.ts`) and Monaco language registration in
 * `CodeEditor` — so neither of them knows about a specific IR. A mode names
 * one of these keys in `editorLanguage`; two modes may share one (SelectionDAG
 * reuses `llvm`) and the grammar is then loaded once.
 *
 * The values are getters, not imports, on purpose: a grammar is a lazy chunk
 * rather than part of the initial download. See contracts/bundle-budget.md.
 *
 * `text` needs no entry — Shiki treats `text`/`plaintext` as having no grammar.
 */
export const EDITOR_GRAMMARS = {
  llvm: () => import("@shikijs/langs/llvm"),
  mermaid: () => import("@shikijs/langs/mermaid"),
} satisfies Record<string, LanguageInput>;

/** Monaco language id of a grammar the app ships. */
export type EditorLanguageId = keyof typeof EDITOR_GRAMMARS;

export const EDITOR_LANGUAGE_IDS = Object.keys(
  EDITOR_GRAMMARS,
) as EditorLanguageId[];

export const EDITOR_GRAMMAR_INPUTS: LanguageInput[] =
  Object.values(EDITOR_GRAMMARS);
