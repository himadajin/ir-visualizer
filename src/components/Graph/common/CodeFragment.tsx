import HighlightedCode from "./HighlightedCode";

interface CodeFragmentProps {
  code: string;
  language?: string;
  style?: React.CSSProperties;
}

const CodeFragment = ({
  code,
  language = "llvm",
  style,
}: CodeFragmentProps) => {
  return (
    <div
      style={{
        background: "#f5f5f5",
        padding: "2px 4px",
        borderRadius: "2px",
        fontSize: "13px",
        display: "inline-flex",
        alignItems: "center",
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      <HighlightedCode code={code} language={language} inline />
    </div>
  );
};

export default CodeFragment;
