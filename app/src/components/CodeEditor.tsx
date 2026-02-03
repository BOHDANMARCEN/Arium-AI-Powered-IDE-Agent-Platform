import React, { useEffect, useRef, useState } from 'react';
import * as monaco from 'monaco-editor';
import { registerAiAutocomplete } from '../editor/monacoAutocomplete';

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  language?: string;
  path?: string;
}

export function CodeEditor({ value, onChange, language = 'typescript', path = '' }: CodeEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const monacoRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (editorRef.current && !monacoRef.current) {
      // Initialize Monaco Editor
      monacoRef.current = monaco.editor.create(editorRef.current, {
        value,
        language,
        theme: 'vs-dark',
        automaticLayout: true,
        minimap: { enabled: false },
        fontSize: 14,
        wordWrap: 'on',
        scrollBeyondLastLine: false,
        renderWhitespace: 'selection',
        renderLineHighlight: 'line',
        tabSize: 2,
        insertSpaces: true,
      });

      // Listen for changes
      monacoRef.current.onDidChangeModelContent(() => {
        const newValue = monacoRef.current?.getValue() || '';
        onChange(newValue);
      });

      // Register AI autocomplete
      registerAiAutocomplete(() => ({
        path: path || '',
        code: monacoRef.current?.getValue() || ''
      }));

      setIsReady(true);
    }

    return () => {
      if (monacoRef.current) {
        monacoRef.current.dispose();
        monacoRef.current = null;
      }
    };
  }, []);

  // Update value when prop changes
  useEffect(() => {
    if (monacoRef.current && value !== monacoRef.current.getValue()) {
      monacoRef.current.setValue(value);
    }
  }, [value]);

  // Update language when prop changes
  useEffect(() => {
    if (monacoRef.current) {
      const model = monacoRef.current.getModel();
      if (model) {
        monaco.editor.setModelLanguage(model, language);
      }
    }
  }, [language]);

  return (
    <div className="code-editor">
      {!isReady && <div className="editor-loading">Loading editor...</div>}
      <div ref={editorRef} style={{ width: '100%', height: '100%' }} />
    </div>
  );
}
