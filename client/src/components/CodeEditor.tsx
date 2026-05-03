import React, { useRef, useCallback, useEffect } from 'react';
import Editor, { OnMount, OnChange } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import { useRoom } from '../context/RoomContext';
import type { RemoteCursor } from '../types';

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  language: string;
  onLanguageChange: (language: string) => void;
  remoteCursors: RemoteCursor[];
}

const LANGUAGES = [
  { value: 'javascript', label: 'JavaScript' },
  { value: 'python', label: 'Python' }
];

export function CodeEditor({
  value,
  onChange,
  language,
  onLanguageChange,
  remoteCursors
}: CodeEditorProps) {
  const { room, emitCodeChange, emitLanguageChange, emitCursorChange } = useRoom();
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const decorationsRef = useRef<string[]>([]);

  const handleEditorMount: OnMount = useCallback((editor) => {
    editorRef.current = editor;

    editor.onDidChangeCursorPosition((e) => {
      if (room) {
        emitCursorChange(room.id, {
          lineNumber: e.position.lineNumber,
          column: e.position.column
        });
      }
    });
  }, [room, emitCursorChange]);

  const handleChange: OnChange = useCallback((newValue) => {
    if (newValue !== undefined) {
      onChange(newValue);
      if (room) {
        emitCodeChange(room.id, newValue);
      }
    }
  }, [onChange, room, emitCodeChange]);

  const handleLanguageChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const newLang = e.target.value;
    onLanguageChange(newLang);
    if (room) {
      emitLanguageChange(room.id, newLang);
    }
  }, [onLanguageChange, room, emitLanguageChange]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    const newDecorations = remoteCursors.map((cursor) => {
      const color = cursor.userId === 'interviewer' ? '#f97316' : '#3b82f6';
      return {
        range: {
          startLineNumber: cursor.position.lineNumber,
          startColumn: cursor.position.column,
          endLineNumber: cursor.position.lineNumber,
          endColumn: cursor.position.column + 1
        },
        options: {
          className: `remote-cursor-${cursor.userId}`,
          beforeContentClassName: 'remote-cursor-marker',
          hoverMessage: { value: cursor.userName },
          stickiness: 1
        }
      };
    });

    decorationsRef.current = editor.deltaDecorations(
      decorationsRef.current,
      newDecorations
    );
  }, [remoteCursors]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-4 p-2 bg-gray-800 border-b border-gray-700">
        <select
          value={language}
          onChange={handleLanguageChange}
          className="px-3 py-1.5 bg-gray-700 text-white rounded border border-gray-600 focus:outline-none focus:border-blue-500"
        >
          {LANGUAGES.map((lang) => (
            <option key={lang.value} value={lang.value}>
              {lang.label}
            </option>
          ))}
        </select>
        <span className="text-gray-400 text-sm">
          {room ? `Room: ${room.code}` : 'Not connected'}
        </span>
      </div>
      <div className="flex-1">
        <Editor
          height="100%"
          language={language}
          value={value}
          onChange={handleChange}
          onMount={handleEditorMount}
          theme="vs-dark"
          options={{
            fontSize: 14,
            fontFamily: "'Fira Code', Consolas, 'Courier New', monospace",
            minimap: { enabled: true },
            scrollBeyondLastLine: false,
            automaticLayout: true,
            tabSize: 2,
            wordWrap: 'on',
            lineNumbers: 'on',
            renderWhitespace: 'selection',
            cursorBlinking: 'smooth',
            cursorSmoothCaretAnimation: 'on'
          }}
        />
      </div>
      <style>{`
        .remote-cursor-marker {
          background: #f97316;
          width: 2px !important;
        }
      `}</style>
    </div>
  );
}
