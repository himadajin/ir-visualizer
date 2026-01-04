import { useEffect, useState } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { createHighlighter, type Highlighter } from 'shiki';

let highlighterPromise: Promise<Highlighter> | null = null;

const getHighlighter = () => {
    if (!highlighterPromise) {
        highlighterPromise = createHighlighter({
            themes: ['github-light'],
            langs: ['text', 'javascript', 'typescript', 'llvm'],
        });
    }
    return highlighterPromise;
};

const CodeNode = ({ data }: NodeProps) => {
    const rawCode = data.label as string;
    // explicit check for null to differentiate from undefined
    const blockLabelProp = data.blockLabel;
    const blockLabel = blockLabelProp === null ? 'entry' : (blockLabelProp as string | undefined);

    // Initialize html with the code to display (unhighlighted initially)
    const [html, setHtml] = useState<string>(rawCode);

    useEffect(() => {
        const highlight = async () => {
            try {
                const highlighter = await getHighlighter();
                const lang = (data.language as string) || 'text';
                const highlighted = highlighter.codeToHtml(rawCode, {
                    lang,
                    theme: 'github-light',
                });
                setHtml(highlighted);
            } catch (e) {
                console.error('Failed to highlight', e);
                setHtml(rawCode);
            }
        };
        highlight();
    }, [rawCode, data.language]);

    return (
        <div 
            className="code-node-wrapper"
            style={{
            padding: '10px',
            borderRadius: '5px',
            border: '1px solid #777',
            background: '#fff',
            fontFamily: 'monospace',
            fontSize: '14px',
            lineHeight: '20px',
            textAlign: 'left',
            height: '100%', 
            boxSizing: 'border-box',
            position: 'relative', 
            // inner pre/code will inherit these
        }}>
            {/* Display extracted label if present */}
            {blockLabel && (
                <div style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    padding: '2px 6px',
                    backgroundColor: '#f0f0f0',
                    borderBottomRightRadius: '4px',
                    borderRight: '1px solid #ddd',
                    borderBottom: '1px solid #ddd',
                    fontSize: '10px',
                    fontWeight: 'bold',
                    color: '#555',
                    zIndex: 10,
                }}>
                    {blockLabel}
                </div>
            )}

            <div dangerouslySetInnerHTML={{ __html: html }} />

            {/* Invisible handles that are not connectable by user dragging */}
            <Handle
                type="target"
                position={Position.Top}
                style={{
                    opacity: 0,
                    top: 0,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    width: '1px',
                    height: '1px',
                }}
                isConnectable={false}
            />
            <Handle
                type="source"
                position={Position.Bottom}
                style={{
                    opacity: 0,
                    bottom: 0,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    width: '1px',
                    height: '1px',
                }}
                isConnectable={false}
            />
        </div>
    );
};

export default CodeNode;
