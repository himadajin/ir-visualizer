import { createHighlighterCore, type HighlighterCore } from "shiki/core";
import { createOnigurumaEngine } from "shiki/engine/oniguruma";
import { EDITOR_GRAMMAR_INPUTS } from "../irModes/editorLanguages";

/** The one theme the app renders in (specs/graph-view.md §6.3). */
export const HIGHLIGHT_THEME = "github-light";

let highlighterPromise: Promise<HighlighterCore> | null = null;

/**
 * The app's single Shiki instance, shared by the Monaco editor and by the code
 * rendered inside graph nodes.
 *
 * Built from `shiki/core` with the theme, grammars and engine named
 * explicitly. Importing `createHighlighter` from `shiki` instead would resolve
 * to `shiki/bundle/full`, whose grammar and theme maps are statically
 * analyzable dynamic imports — the bundler then emits a chunk for every
 * language and theme Shiki knows about, whether or not this app can select it.
 * See contracts/bundle-budget.md.
 */
export const getHighlighter = (): Promise<HighlighterCore> => {
  highlighterPromise ??= createHighlighterCore({
    themes: [() => import("@shikijs/themes/github-light")],
    langs: EDITOR_GRAMMAR_INPUTS,
    engine: createOnigurumaEngine(() => import("shiki/wasm")),
  });
  return highlighterPromise;
};
