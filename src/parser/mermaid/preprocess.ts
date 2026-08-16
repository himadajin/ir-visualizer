// mermaid@11.16.1 preprocess steps the jison flowchart parser requires.
// Copied in miniature so this mode never imports mermaid.core (that file
// `import()`s every diagram type and would emit them all into dist).

const FRONT_MATTER = /^([^\S\n\r]*)-{3}\s*[\n\r](.*?)[\n\r]\1-{3}\s*[\n\r]+/s;
const DIRECTIVE =
  /%{2}{\s*(?:(\w+)\s*:|(\w+))\s*(?:(\w+)|((?:(?!}%{2}).|\r?\n)*))?\s*(?:}%{2})?/gi;
const FULL_LINE_COMMENT = /^\s*%%(?!{)[^\n]+\n?/gm;

const FLOWCHART_HEADER = /^\s*(?:flowchart(?:-elk)?|graph)\b/;

function cleanupText(code: string): string {
  return code
    .replace(/\r\n?/g, "\n")
    .replace(
      /<(\w+)([^>]*)>/g,
      (_match, tag: string, attributes: string) =>
        "<" + tag + attributes.replace(/="([^"]*)"/g, "='$1'") + ">",
    );
}

function encodeEntities(text: string): string {
  let txt = text;
  txt = txt.replace(/style.*:\S*#.*;/g, (s) => s.substring(0, s.length - 1));
  txt = txt.replace(/classDef.*:\S*#.*;/g, (s) => s.substring(0, s.length - 1));
  txt = txt.replace(/#\w+;/g, (s) => {
    const innerTxt = s.substring(1, s.length - 1);
    const isInt = /^\+?\d+$/.test(innerTxt);
    if (isInt) {
      return "\uFB02\xB0\xB0" + innerTxt + "\xB6\xDF";
    }
    return "\uFB02\xB0" + innerTxt + "\xB6\xDF";
  });
  return txt;
}

export function preprocessFlowchartSource(input: string): string {
  const cleaned = cleanupText(input).replace(FRONT_MATTER, "");
  const withoutDirectives = cleaned.replace(DIRECTIVE, "");
  const withoutComments = withoutDirectives
    .replace(FULL_LINE_COMMENT, "")
    .trimStart();
  return encodeEntities(withoutComments);
}

export function isFlowchartSource(preprocessed: string): boolean {
  return FLOWCHART_HEADER.test(preprocessed);
}

export const NOT_A_FLOWCHART_MESSAGE =
  "Mermaid mode accepts flowchart diagrams only (graph / flowchart).";
