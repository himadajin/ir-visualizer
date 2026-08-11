import React from "react";
import Editor from "@monaco-editor/react";

import { shikiToMonaco } from "@shikijs/monaco";
import type { Monaco } from "@monaco-editor/react";
import { EDITOR_LANGUAGE_IDS } from "../../irModes/editorLanguages";
import { HIGHLIGHT_THEME, getHighlighter } from "../../utils/highlighter";

interface CodeEditorProps {
  code: string;
  language?: string;
  onChange: (value: string | undefined) => void;
}

export const CodeEditor: React.FC<CodeEditorProps> = ({
  code,
  language = "markdown",
  onChange,
}) => {
  // The languages come from the registry's one declaration, so adding an IR
  // never means editing this file (contracts/ir-mode-registry.md).
  const handleBeforeMount = async (monaco: Monaco) => {
    for (const id of EDITOR_LANGUAGE_IDS) {
      monaco.languages.register({ id });
    }
    shikiToMonaco(await getHighlighter(), monaco);
  };

  return (
    <Editor
      height="100%"
      defaultLanguage={language}
      language={language}
      value={code}
      onChange={onChange}
      theme={HIGHLIGHT_THEME}
      beforeMount={handleBeforeMount}
      options={{
        minimap: { enabled: false },
        fontSize: 14,
        wordWrap: "off",
        scrollBeyondLastLine: false,
        automaticLayout: true,
        accessibilitySupport: "off",
        tabSize: 2,
        colorDecorators: false,
      }}
    />
  );
};
