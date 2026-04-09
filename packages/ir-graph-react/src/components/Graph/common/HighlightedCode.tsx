import { useEffect, useState } from "react";
import { createHighlighter, type Highlighter } from "shiki";

let highlighterPromise: Promise<Highlighter> | null = null;

const getHighlighter = () => {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: ["github-light"],
      langs: ["text", "javascript", "typescript", "llvm"],
    });
  }
  return highlighterPromise;
};

interface HighlightedCodeProps {
  code: string;
  language?: string;
  inline?: boolean;
  style?: React.CSSProperties;
}

const HighlightedCode = ({
  code,
  language = "text",
  inline = false,
  style,
}: HighlightedCodeProps) => {
  const [html, setHtml] = useState<string>(code);

  useEffect(() => {
    const highlight = async () => {
      try {
        const highlighter = await getHighlighter();
        let highlighted = highlighter.codeToHtml(code, {
          lang: language,
          theme: "github-light",
        });

        if (inline) {
          // Remove <pre> and <code> tags
          highlighted = highlighted.replace(/<pre[^>]*>/g, "");
          highlighted = highlighted.replace(/<\/pre>/g, "");
          highlighted = highlighted.replace(/<code[^>]*>/g, "");
          highlighted = highlighted.replace(/<\/code>/g, "");
        }
        setHtml(highlighted);
      } catch (e) {
        console.error("Failed to highlight", e);
        setHtml(code);
      }
    };
    highlight();
  }, [code, language, inline]);

  return (
    <div
      style={{ display: inline ? "inline" : "block", ...style }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};

export default HighlightedCode;
