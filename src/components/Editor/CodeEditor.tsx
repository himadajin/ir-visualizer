import React from "react";
import Editor from "@monaco-editor/react";

import { shikiToMonaco } from "@shikijs/monaco";
import { createHighlighter } from "shiki";
import type { Monaco } from "@monaco-editor/react";

interface CodeEditorProps {
  code: string;
  language?: string;
  onChange: (value: string | undefined) => void;
}

let highlighterPromise: ReturnType<typeof createHighlighter> | null = null;

const ensureHighlighter = () => {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: ["github-light"],
      langs: ["mermaid", "llvm"],
    });
  }
  return highlighterPromise;
};

export const CodeEditor: React.FC<CodeEditorProps> = ({
  code,
  language = "markdown",
  onChange,
}) => {
  const handleBeforeMount = async (monaco: Monaco) => {
    monaco.languages.register({ id: "mermaid" });
    monaco.languages.register({ id: "llvm" });
    const highlighter = await ensureHighlighter();
    shikiToMonaco(highlighter, monaco);
  };

  return (
    <Editor
      height="100%"
      defaultLanguage={language}
      language={language}
      value={code}
      onChange={onChange}
      theme="github-light"
      beforeMount={handleBeforeMount}
      options={{
        minimap: { enabled: false },
        fontSize: 14,
        wordWrap: "off",
        scrollBeyondLastLine: false,
        automaticLayout: true,
        accessibilitySupport: "off",
        tabSize: 2,
      }}
    />
  );
};
