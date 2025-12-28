import React from 'react';
import Editor from '@monaco-editor/react';

interface CodeEditorProps {
    code: string;
    language?: string;
    onChange: (value: string | undefined) => void;
}

export const CodeEditor: React.FC<CodeEditorProps> = ({ code, language = 'markdown', onChange }) => {
    return (
        <Editor
            height="100%"
            defaultLanguage={language}
            language={language}
            value={code}
            onChange={onChange}
            theme="vs-dark"
            options={{
                minimap: { enabled: false },
                fontSize: 14,
                wordWrap: 'on',
                scrollBeyondLastLine: false,
                automaticLayout: true,
                accessibilitySupport: 'off',
                tabSize: 2,
            }}
        />
    );
};
