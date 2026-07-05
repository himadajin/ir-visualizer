import { Paper } from "@mui/material";
import { CodeEditor } from "../Editor/CodeEditor";
import { EditorToolbar } from "./EditorToolbar";

interface EditorPaneProps {
  width: number | string;
  code: string;
  language: string;
  onChange: (value: string | undefined) => void;
  onClear: () => void;
}

export function EditorPane({
  width,
  code,
  language,
  onChange,
  onClear,
}: EditorPaneProps) {
  return (
    <Paper
      square
      sx={{
        width,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <EditorToolbar onClear={onClear} />
      <CodeEditor code={code} onChange={onChange} language={language} />
    </Paper>
  );
}
