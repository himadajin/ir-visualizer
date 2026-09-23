import HighlightedCode from "./HighlightedCode";

interface CodeFragmentProps {
  code: string;
  language?: string;
}

/** One unwrapped, highlighted code run inside a SelectionDAG table cell. */
const CodeFragment = ({ code, language = "llvm" }: CodeFragmentProps) => {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        whiteSpace: "nowrap",
      }}
    >
      <HighlightedCode code={code} language={language} inline />
    </div>
  );
};

export default CodeFragment;
