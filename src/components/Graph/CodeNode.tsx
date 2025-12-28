import { useEffect, useState } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { createHighlighter, type Highlighter } from 'shiki';

let highlighterPromise: Promise<Highlighter> | null = null;

const getHighlighter = () => {
    if (!highlighterPromise) {
        highlighterPromise = createHighlighter({
            themes: ['github-light'],
            langs: ['text', 'javascript', 'typescript'],
        });
    }
    return highlighterPromise;
};

const CodeNode = ({ data }: NodeProps) => {
    const [html, setHtml] = useState<string>(data.label as string);

    useEffect(() => {
        const highlight = async () => {
            try {
                const highlighter = await getHighlighter();
                const code = data.label as string;
                const highlighted = highlighter.codeToHtml(code, {
                    lang: 'text',
                    theme: 'github-light',
                });
                setHtml(highlighted);
            } catch (e) {
                console.error('Failed to highlight', e);
                setHtml(data.label as string);
            }
        };
        highlight();
    }, [data.label]);

    return (
        <div style={{
            padding: '10px',
            borderRadius: '5px',
            border: '1px solid #777',
            background: '#fff',
            fontFamily: 'monospace',
            textAlign: 'left',
            height: '100%',
            overflow: 'hidden',
            boxSizing: 'border-box',
        }}>
            <div dangerouslySetInnerHTML={{ __html: html }} />

            {/* Invisible handles that are not connectable by user dragging */}
            <Handle
                type="target"
                position={Position.Top}
                style={{ opacity: 0 }}
                isConnectable={false}
            />
            <Handle
                type="source"
                position={Position.Bottom}
                style={{ opacity: 0 }}
                isConnectable={false}
            />
        </div>
    );
};

export default CodeNode;
