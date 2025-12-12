/**
 * Arium UI Shell - Main React Application
 * Real-time connection to Arium backend via WebSocket
 */

import React, { useState, useEffect, useRef } from 'react';
import './App.css';
import { CodeEditor } from './components/CodeEditor';

interface Event {
  id: string;
  type: string;
  timestamp: number;
  payload: any;
}

function getLanguageFromPath(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'ts': return 'typescript';
    case 'tsx': return 'typescript';
    case 'js': return 'javascript';
    case 'jsx': return 'javascript';
    case 'py': return 'python';
    case 'json': return 'json';
    case 'md': return 'markdown';
    case 'css': return 'css';
    case 'html': return 'html';
    default: return 'plaintext';
  }
}

function App() {
  const [connected, setConnected] = useState(false);
  const [events, setEvents] = useState<Event[]>([]);
  const [agentInput, setAgentInput] = useState('');
  const [files, setFiles] = useState<string[]>([]);
  const [currentFile, setCurrentFile] = useState<string>('');
  const [fileContent, setFileContent] = useState<string>('');
  const wsRef = useRef<WebSocket | null>(null);

  const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:4000';
  const WS_URL = process.env.REACT_APP_WS_URL || 'ws://localhost:4000';

  useEffect(() => {
    // Connect to WebSocket
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      console.log('Connected to Arium server');
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'event') {
        setEvents(prev => [data.event, ...prev].slice(0, 100)); // Keep last 100
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    ws.onclose = () => {
      setConnected(false);
      console.log('Disconnected from Arium server');
    };

    // Load files list
    loadFiles();

    return () => {
      ws.close();
    };
  }, []);

  const loadFiles = async () => {
    try {
      const response = await fetch(`${API_URL}/vfs/list`);
      const data = await response.json();
      setFiles(data);
    } catch (error) {
      console.error('Failed to load files:', error);
    }
  };

  const loadFile = async (path: string) => {
    try {
      const response = await fetch(`${API_URL}/vfs/read?path=${encodeURIComponent(path)}`);
      const data = await response.json();
      setCurrentFile(path);
      setFileContent(data.content);
    } catch (error) {
      console.error('Failed to load file:', error);
    }
  };

  const runAgent = async () => {
    if (!agentInput.trim()) return;

    try {
      const response = await fetch(`${API_URL}/agent/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: agentInput }),
      });
      const result = await response.json();
      console.log('Agent result:', result);
      setAgentInput('');
      loadFiles(); // Refresh file list
    } catch (error) {
      console.error('Failed to run agent:', error);
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <img src="/logo.png" alt="Arium" className="logo" />
        <h1>Arium — AI IDE & Agent Platform</h1>
        <div className={`status ${connected ? 'connected' : 'disconnected'}`}>
          {connected ? '🟢 Connected' : '🔴 Disconnected'}
        </div>
      </header>

      <div className="app-content">
        {/* Left Sidebar - Files */}
        <div className="sidebar">
          <h2>Files</h2>
          <button onClick={loadFiles}>Refresh</button>
          <ul className="file-list">
            {files.map((file) => (
              <li
                key={file}
                className={currentFile === file ? 'active' : ''}
                onClick={() => loadFile(file)}
              >
                {file}
              </li>
            ))}
          </ul>
        </div>

        {/* Main Editor Area */}
        <div className="editor-area">
          <div className="editor-toolbar">
            <h3>{currentFile || 'No file selected'}</h3>
          </div>
          <CodeEditor
            value={fileContent}
            onChange={setFileContent}
            path={currentFile}
            language={getLanguageFromPath(currentFile)}
          />
        </div>

        {/* Right Sidebar - Agent & Events */}
        <div className="sidebar">
          <div className="agent-panel">
            <h2>Agent</h2>
            <textarea
              className="agent-input"
              value={agentInput}
              onChange={(e) => setAgentInput(e.target.value)}
              placeholder="Enter agent task..."
              onKeyDown={(e) => {
                if (e.key === 'Enter' && e.ctrlKey) {
                  runAgent();
                }
              }}
            />
            <button onClick={runAgent} disabled={!connected}>
              Run Agent (Ctrl+Enter)
            </button>
          </div>

          <div className="events-panel">
            <h2>Events ({events.length})</h2>
            <div className="events-list">
              {events.slice(0, 20).map((event) => (
                <div key={event.id} className="event-item">
                  <span className="event-type">{event.type}</span>
                  <span className="event-time">
                    {new Date(event.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
