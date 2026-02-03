/**
 * Debug Dashboard - React Component
 * Real-time monitoring and debugging interface
 *
 * Author: Bogdan Marcen & ChatGPT 5.1
 */

import React, { useState, useEffect } from 'react';
import { EventBus, EventEnvelope } from '../../core/eventBus';
import { AgentMessage } from '../../core/agent/agentCore';

interface DebugDashboardProps {
  eventBus: EventBus;
  websocketUrl?: string;
}

export const DebugDashboard: React.FC<DebugDashboardProps> = ({ eventBus, websocketUrl = 'ws://localhost:3000/events' }) => {
  const [events, setEvents] = useState<EventEnvelope[]>([]);
  const [agentSteps, setAgentSteps] = useState<any[]>([]);
  const [contextWindow, setContextWindow] = useState<AgentMessage[]>([]);
  const [toolLogs, setToolLogs] = useState<any[]>([]);
  const [modelCalls, setModelCalls] = useState<any[]>([]);
  const [executionTimeline, setExecutionTimeline] = useState<any[]>([]);
  const [websocketConnected, setWebsocketConnected] = useState(false);

  useEffect(() => {
    // Subscribe to local events
    const listener = (event: EventEnvelope) => {
      setEvents((prev) => [event, ...prev].slice(0, 100));

      // Categorize events
      switch (event.type) {
        case 'AgentStepEvent':
          setAgentSteps((prev) => [event.payload, ...prev].slice(0, 50));
          break;
        case 'ToolInvocationEvent':
        case 'ToolResultEvent':
        case 'ToolErrorEvent':
          setToolLogs((prev) => [event, ...prev].slice(0, 50));
          break;
        case 'ModelResponseEvent':
        case 'ModelErrorEvent':
          setModelCalls((prev) => [event, ...prev].slice(0, 50));
          break;
        case 'AgentStartEvent':
        case 'AgentFinishEvent':
          setExecutionTimeline((prev) => [event, ...prev].slice(0, 100));
          break;
      }
    };

    eventBus.on('any', listener);

    // Setup WebSocket connection
    let ws: WebSocket | null = null;
    if (websocketUrl) {
      ws = new WebSocket(websocketUrl);

      ws.onopen = () => {
        console.log('WebSocket connected');
        setWebsocketConnected(true);
      };

      ws.onmessage = (message) => {
        try {
          const event = JSON.parse(message.data);
          listener(event);
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };

      ws.onclose = () => {
        console.log('WebSocket disconnected');
        setWebsocketConnected(false);
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        setWebsocketConnected(false);
      };
    }

    return () => {
      eventBus.off('any', listener);
      if (ws) {
        ws.close();
      }
    };
  }, [eventBus, websocketUrl]);

  return (
    <div className="debug-dashboard">
      <h2>🔍 Debug Dashboard</h2>
      <div className="status-bar">
        <span className={`status-indicator ${websocketConnected ? 'connected' : 'disconnected'}`}>
          {websocketConnected ? '🟢 WebSocket Connected' : '🔴 WebSocket Disconnected'}
        </span>
        <span className="event-count">📊 Events: {events.length}</span>
      </div>
      <p className="subtitle">Real-time monitoring and debugging interface</p>

      <div className="dashboard-grid">
        {/* Event Bus Feed */}
        <div className="dashboard-panel">
          <h3>📡 EventBus Feed (Last 100)</h3>
          <div className="event-feed">
            {events.length === 0 ? (
              <p className="empty-state">No events yet. Waiting for activity...</p>
            ) : (
              <ul className="event-list">
                {events.map((event, index) => (
                  <li key={index} className="event-item">
                    <span className="event-type">{event.type}</span>
                    <span className="event-time">
                      {new Date(event.timestamp).toLocaleTimeString()}
                    </span>
                    <pre className="event-payload">
                      {JSON.stringify(event.payload, null, 2)}
                    </pre>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Agent Step History */}
        <div className="dashboard-panel">
          <h3>🤖 Agent Step History</h3>
          <div className="step-history">
            {agentSteps.length === 0 ? (
              <p className="empty-state">No agent steps recorded yet</p>
            ) : (
              <ul className="step-list">
                {agentSteps.map((step, index) => (
                  <li key={index} className="step-item">
                    <strong>Step {agentSteps.length - index}:</strong> {step.action}
                    <div className="step-details">
                      {step.observation && (
                        <div>Observation: {step.observation}</div>
                      )}
                      {step.reward !== undefined && (
                        <div>Reward: {step.reward}</div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Context Window */}
        <div className="dashboard-panel">
          <h3>💬 Context Window</h3>
          <div className="context-window">
            {contextWindow.length === 0 ? (
              <p className="empty-state">Context window is empty</p>
            ) : (
              <div className="message-list">
                {contextWindow.map((msg, index) => (
                  <div key={index} className={`message ${msg.role}`}>
                    <strong>{msg.role}:</strong> {msg.content}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Tool Logs */}
        <div className="dashboard-panel">
          <h3>🛠️ Tool Logs</h3>
          <div className="tool-logs">
            {toolLogs.length === 0 ? (
              <p className="empty-state">No tool invocations yet</p>
            ) : (
              <ul className="tool-log-list">
                {toolLogs.map((log, index) => (
                  <li key={index} className={`tool-log ${log.type}`}>
                    <span className="tool-name">{log.payload.toolId}</span>
                    <span className="tool-type">{log.type}</span>
                    <pre className="tool-data">
                      {JSON.stringify(log.payload, null, 2)}
                    </pre>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Model Call Logs */}
        <div className="dashboard-panel">
          <h3>🤖 Model Call Logs</h3>
          <div className="model-logs">
            {modelCalls.length === 0 ? (
              <p className="empty-state">No model calls recorded yet</p>
            ) : (
              <ul className="model-log-list">
                {modelCalls.map((call, index) => (
                  <li key={index} className={`model-log ${call.type}`}>
                    <span className="model-id">{call.payload.modelId}</span>
                    <span className="call-type">{call.type}</span>
                    <div className="call-details">
                      Attempt: {call.payload.attempt || 1}
                      {call.payload.success !== undefined && (
                        <span className={`status ${call.payload.success ? 'success' : 'error'}`}>
                          {call.payload.success ? '✅ Success' : '❌ Error'}
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Execution Timeline */}
        <div className="dashboard-panel">
          <h3>⏱️ Execution Timeline</h3>
          <div className="timeline">
            {executionTimeline.length === 0 ? (
              <p className="empty-state">No execution events yet</p>
            ) : (
              <ul className="timeline-list">
                {executionTimeline.map((event, index) => (
                  <li key={index} className="timeline-item">
                    <span className="timeline-time">
                      {new Date(event.timestamp).toLocaleTimeString()}
                    </span>
                    <span className={`timeline-event ${event.type}`}>
                      {event.type}
                    </span>
                    {event.payload && (
                      <pre className="timeline-data">
                        {JSON.stringify(event.payload, null, 2)}
                      </pre>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      <div className="dashboard-footer">
        <p>💡 Tip: Use this dashboard to monitor agent execution in real-time</p>
        <p>📊 Total Events: {events.length} | WebSocket: {websocketConnected ? 'Connected' : 'Disconnected'}</p>
      </div>
    </div>
  );
};

// Add CSS styles
const styles = `
.debug-dashboard {
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
  max-width: 1400px;
  margin: 0 auto;
  padding: 20px;
  color: #333;
}

.dashboard-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
  gap: 20px;
  margin-top: 20px;
}

.dashboard-panel {
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 10px rgba(0,0,0,0.1);
  padding: 15px;
  transition: all 0.3s ease;
}

.dashboard-panel:hover {
  box-shadow: 0 4px 15px rgba(0,0,0,0.15);
}

.dashboard-panel h3 {
  color: #2c3e50;
  border-bottom: 2px solid #eee;
  padding-bottom: 10px;
  margin-top: 0;
}

.empty-state {
  color: #7f8c8d;
  font-style: italic;
  text-align: center;
  padding: 20px;
}

.event-list, .step-list, .tool-log-list, .model-log-list, .timeline-list {
  list-style: none;
  padding: 0;
  margin: 0;
  max-height: 300px;
  overflow-y: auto;
}

.event-item, .step-item, .tool-log, .model-log, .timeline-item {
  padding: 10px;
  border-bottom: 1px solid #eee;
  font-size: 14px;
}

.event-item:hover, .step-item:hover, .tool-log:hover, .model-log:hover, .timeline-item:hover {
  background-color: #f8f9fa;
}

.event-type, .tool-type, .call-type, .timeline-event {
  font-family: 'Courier New', monospace;
  font-size: 12px;
  color: white;
  padding: 2px 6px;
  border-radius: 4px;
  margin-right: 8px;
}

.event-type {
  background-color: #3498db;
}

.tool-type {
  background-color: #2ecc71;
}

.call-type {
  background-color: #e74c3c;
}

.timeline-event {
  background-color: #9b59b6;
}

.event-time, .timeline-time {
  color: #7f8c8d;
  font-size: 12px;
  margin-left: 10px;
}

.event-payload, .tool-data, .timeline-data {
  font-size: 12px;
  background: #f8f9fa;
  padding: 8px;
  border-radius: 4px;
  overflow-x: auto;
  white-space: pre-wrap;
  word-wrap: break-word;
}

.status.success {
  color: #27ae60;
}

.status.error {
  color: #e74c3c;
}

.dashboard-footer {
  margin-top: 30px;
  padding: 15px;
  background: #f8f9fa;
  border-radius: 8px;
  text-align: center;
  color: #7f8c8d;
}

.status-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
  padding: 10px;
  background: #f8f9fa;
  border-radius: 8px;
}

.status-indicator {
  padding: 5px 12px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: bold;
}

.status-indicator.connected {
  background-color: #2ecc71;
  color: white;
}

.status-indicator.disconnected {
  background-color: #e74c3c;
  color: white;
}

.event-count {
  background-color: #3498db;
  color: white;
  padding: 5px 12px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: bold;
}
`;

// Inject styles
const styleElement = document.createElement('style');
styleElement.textContent = styles;

// Add additional styles
styleElement.textContent += `
.status-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
  padding: 10px;
  background: #f8f9fa;
  border-radius: 8px;
}

.status-indicator {
  padding: 5px 12px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: bold;
}

.status-indicator.connected {
  background-color: #2ecc71;
  color: white;
}

.status-indicator.disconnected {
  background-color: #e74c3c;
  color: white;
}

.event-count {
  background-color: #3498db;
  color: white;
  padding: 5px 12px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: bold;
}
`;

document.head.appendChild(styleElement);