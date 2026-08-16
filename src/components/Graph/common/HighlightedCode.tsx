import { useEffect, useState } from "react";
import { HIGHLIGHT_THEME, getHighlighter } from "../../../utils/highlighter";

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
          theme: HIGHLIGHT_THEME,
        });

        // Shiki's <pre> carries the user-agent default block margin (12px
        // top/bottom in this app), which would inflate the measured box
        // handed to ELK (specs/graph-view.md §5) — reset it so the painted
        // node is the box that was measured. A no-op when `inline` strips
        // the tag below.
        highlighted = highlighted.replace(
          /(<pre[^>]*\sstyle=")/,
          "$1margin:0;",
        );

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
