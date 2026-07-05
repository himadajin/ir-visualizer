import HighlightedCode from "./HighlightedCode";

// Consumed by selectionDAGLayoutUtils.ts and converter.ts to size SelectionDAG
// nodes, which are the only current consumer of CodeFragment.
export const CODE_FRAGMENT_PADDING_X = 4;
export const CODE_FRAGMENT_PADDING_Y = 2;

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
        padding: `${CODE_FRAGMENT_PADDING_Y}px ${CODE_FRAGMENT_PADDING_X}px`,
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
