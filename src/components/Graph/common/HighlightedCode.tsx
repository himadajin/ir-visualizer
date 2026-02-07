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
}

const HighlightedCode = ({ code, language = "text" }: HighlightedCodeProps) => {
  const [html, setHtml] = useState<string>(code);

  useEffect(() => {
    const highlight = async () => {
      try {
        const highlighter = await getHighlighter();
        const highlighted = highlighter.codeToHtml(code, {
          lang: language,
          theme: "github-light",
        });
        setHtml(highlighted);
      } catch (e) {
        console.error("Failed to highlight", e);
        setHtml(code);
      }
    };
    highlight();
  }, [code, language]);

  return <div dangerouslySetInnerHTML={{ __html: html }} />;
};

export default HighlightedCode;
