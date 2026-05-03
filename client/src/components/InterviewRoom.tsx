import React, { useState, useCallback, useEffect } from 'react';
import { CodeEditor } from './CodeEditor';
import { ChatPanel } from './ChatPanel';
import { VideoWindow } from './VideoWindow';
import { useRoom } from '../context/RoomContext';
import type { ExecuteResult } from '../types';

export function InterviewRoom() {
  const { user, room, isRecording, startRecording, stopRecording, endInterview, leaveRoom } = useRoom();
  const [code, setCode] = useState('// Start coding here\n');
  const [language, setLanguage] = useState('javascript');
  const [executionInput, setExecutionInput] = useState('');
  const [executionOutput, setExecutionOutput] = useState<ExecuteResult | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [showEndConfirm, setShowEndConfirm] = useState(false);

  const handleCodeChange = useCallback((newCode: string) => {
    setCode(newCode);
  }, []);

  const handleLanguageChange = useCallback((newLang: string) => {
    setLanguage(newLang);
  }, []);

  const handleExecute = async () => {
    setIsExecuting(true);
    setExecutionOutput(null);

    try {
      const response = await fetch('http://localhost:4001/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          language,
          input: executionInput
        })
      });

      const result = await response.json();
      setExecutionOutput(result);
    } catch {
      setExecutionOutput({
        success: false,
        output: '',
        error: 'Execution service unavailable',
        time: 0
      });
    }

    setIsExecuting(false);
  };

  const handleLeave = () => {
    leaveRoom();
  };

  const handleEndInterview = () => {
    endInterview();
    setShowEndConfirm(false);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        handleExecute();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [code, language, executionInput]);

  return (
    <div className="h-screen flex flex-col bg-gray-900">
      <header className="flex items-center justify-between px-4 py-3 bg-gray-800 border-b border-gray-700">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold text-white">Interview Platform</h1>
          <span className="px-3 py-1 bg-gray-700 rounded text-sm text-gray-300">
            Room: <span className="font-mono font-bold text-green-400">{room?.code}</span>
          </span>
          <span className={`px-2 py-1 rounded text-xs font-medium ${
            user?.role === 'interviewer' ? 'bg-orange-600 text-white' : 'bg-blue-600 text-white'
          }`}>
            {user?.role === 'interviewer' ? 'Interviewer' : 'Candidate'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {isRecording ? (
            <button
              onClick={stopRecording}
              className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 flex items-center gap-2"
            >
              <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
              Stop Recording
            </button>
          ) : (
            <button
              onClick={startRecording}
              className="px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-600"
            >
              Start Recording
            </button>
          )}
          <button
            onClick={() => setShowEndConfirm(true)}
            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
          >
            End Interview
          </button>
          <button
            onClick={handleLeave}
            className="px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-600"
          >
            Leave
          </button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 flex flex-col">
          <div className="flex-1">
            <CodeEditor
              value={code}
              onChange={handleCodeChange}
              language={language}
              onLanguageChange={handleLanguageChange}
              remoteCursors={[]}
            />
          </div>

          <div className="h-48 border-t border-gray-700 bg-gray-800 flex flex-col">
            <div className="flex items-center gap-4 px-4 py-2 border-b border-gray-700">
              <span className="text-sm text-gray-300 font-medium">Output</span>
              <div className="flex items-center gap-2 flex-1">
                <input
                  type="text"
                  value={executionInput}
                  onChange={(e) => setExecutionInput(e.target.value)}
                  placeholder="Input for stdin (optional)"
                  className="flex-1 px-3 py-1 bg-gray-700 text-white text-sm rounded border border-gray-600 focus:outline-none focus:border-blue-500"
                />
              </div>
              <button
                onClick={handleExecute}
                disabled={isExecuting}
                className="px-4 py-1 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 text-sm"
              >
                {isExecuting ? 'Running...' : 'Run (Ctrl+Enter)'}
              </button>
            </div>
            <div className="flex-1 p-4 overflow-auto font-mono text-sm">
              {executionOutput ? (
                <div className={executionOutput.success ? 'text-green-400' : 'text-red-400'}>
                  {executionOutput.success ? (
                    <pre className="whitespace-pre-wrap">{executionOutput.output || '(no output)'}</pre>
                  ) : (
                    <span className="text-red-400">{executionOutput.error}</span>
                  )}
                  {executionOutput.success && (
                    <div className="text-gray-500 mt-2 text-xs">
                      Executed in {executionOutput.time}ms
                    </div>
                  )}
                </div>
              ) : (
                <span className="text-gray-500">Click "Run" to execute your code</span>
              )}
            </div>
          </div>
        </div>

        <ChatPanel />
      </div>

      <VideoWindow isRecording={isRecording} />

      {showEndConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-xl p-6 max-w-sm w-full mx-4">
            <h3 className="text-xl font-bold text-white mb-4">End Interview?</h3>
            <p className="text-gray-400 mb-6">
              Are you sure you want to end this interview? This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowEndConfirm(false)}
                className="flex-1 py-2 bg-gray-700 text-white rounded hover:bg-gray-600"
              >
                Cancel
              </button>
              <button
                onClick={handleEndInterview}
                className="flex-1 py-2 bg-red-600 text-white rounded hover:bg-red-700"
              >
                End Interview
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
