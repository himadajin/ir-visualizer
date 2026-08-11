/**
 * The LLVM node/edge id convention (`specs/llvm-ir.md` §4.1), shared by the CFG
 * builder and the Use-Def builder so both views namespace identically.
 *
 * Two rules produce every id. A name is reduced to its canonical form — sigil
 * and surrounding quotes removed — so that spellings LLVM considers equal are
 * equal here too. Every fragment is then escaped so it can contain neither the
 * separator nor the escape character, and the fragments are joined. Distinct
 * keys therefore always produce distinct ids, and an id decodes back to its
 * fragments.
 *
 * The constructors below are the only supported way to build these ids:
 * escaping applies once, at the point a raw fragment enters, and an already
 * built id is spliced in as-is (it is already a valid fragment sequence).
 */

const SEPARATOR = ":";

/**
 * Escape a free-text fragment. `%` goes first so that the `%` introduced by the
 * `:` rule is not escaped again; decoding is the reverse pair.
 */
function fragment(raw: string): string {
  return raw.replace(/%/g, "%25").replace(/:/g, "%3A");
}

/**
 * The canonical form of a name: sigil dropped, surrounding quotes dropped,
 * escape sequences kept verbatim (never unescaped) — the same reduction the
 * tokenizer performs for `Token.value`, restated here because `src/graphBuilder`
 * imports downward only (`architecture.md`) and the AST keeps the raw spelling
 * for display. Total: an unterminated quoted name keeps its opening quote
 * rather than throwing.
 */
export function canonicalName(raw: string): string {
  const withoutSigil = /^[@%!#]/.test(raw) ? raw.slice(1) : raw;
  const quoted = /^"(.*)"$/.exec(withoutSigil);
  return quoted === null ? withoutSigil : quoted[1];
}

/** Join parts that are already escaped (raw text must go through `fragment`). */
const join = (...parts: string[]): string => parts.join(SEPARATOR);

/** `func:<name>` — the per-function namespace both views hang their ids on. */
export const functionId = (name: string): string =>
  join("func", fragment(canonicalName(name)));

export const functionHeaderId = (funcId: string): string =>
  join(funcId, "header");

export const functionExitId = (funcId: string): string => join(funcId, "exit");

export const basicBlockId = (funcId: string, blockId: string): string =>
  join(funcId, "block", fragment(blockId));

export const globalVariableId = (name: string): string =>
  join("global", fragment(canonicalName(name)));

export const attributeGroupId = (id: string): string =>
  join("attr", fragment(canonicalName(id)));

export const metadataId = (id: string): string =>
  join("meta", fragment(canonicalName(id)));

/**
 * Declarations are keyed by their position in module order: their names are not
 * extracted yet (`specs/llvm-ir.md` §5), so every declaration would otherwise
 * carry the same id.
 */
export const declarationId = (index: number): string =>
  join("decl", String(index));

/**
 * Use-Def view ids, named after the tags they emit rather than the view: a
 * `useDef…` name reads as a React hook to the lint rules.
 */
export const udLineId = (
  funcId: string,
  blockId: string,
  index: number,
): string => join(funcId, "ud", fragment(blockId), String(index));

export const udArgumentId = (funcId: string, name: string): string =>
  join(funcId, "udarg", fragment(name));

export const udExternalId = (funcId: string, name: string): string =>
  join(funcId, "udext", fragment(name));

/**
 * `edge:<source>:<target>[:<variant>…]`. The endpoint ids are spliced in whole:
 * every id kind has a fixed fragment count once its tags are read, so the
 * concatenation reads back unambiguously without a second escaping level. The
 * variant fragments are what keep parallel edges between one pair apart.
 */
export const edgeId = (
  source: string,
  target: string,
  ...variant: string[]
): string => join("edge", source, target, ...variant.map(fragment));
