# Core Systems Overview — Event Bus, VFS, Model Adapter Layer

**Version:** 1.0  
**Authors:** Bogdan Marcen & ChatGPT 5.1 (AI Co-Developer)

Arium's core systems form the backbone of all data flow and execution logic.  
This document describes three primary components that enable synchronized reasoning, deterministic behavior, and fully auditable workflows:

1. **Event Bus** — communication layer
2. **Virtual File System (VFS)** — storage, versioning, diffs
3. **Model Adapter Layer** — unified interface to LLM providers

Together, they form the infrastructure upon which agents, tools, and UI interact.

---

# 1. Event Bus

The Event Bus is Arium's asynchronous communication pipeline.  
Every subsystem exchanges information exclusively through typed events.

```
UI → Event Bus → Core  
Core → Event Bus → UI  
Agent → Event Bus → Tools  
Tools → Event Bus → Agent  
```

It ensures loose coupling, real-time updates, and a complete historical trace.

---

## 1.1 Event Bus Responsibilities

* transport model requests/responses
* broadcast tool invocations/results
* record VFS mutations
* emit security alerts
* store append-only logs
* enable replay & debugging

---

## 1.2 Event Schema

Each event follows a strict JSON schema:

```json
{
  "id": "evt-1234",
  "type": "ToolResultEvent",
  "timestamp": 1733881200000,
  "payload": { ... },
  "meta": {
    "agentId": "default-agent",
    "toolId": "fs.write"
  }
}
```

### Required Fields

* `id` — unique ULID
* `type` — event type
* `timestamp` — ms
* `payload` — structured content
* `meta` — contextual metadata

---

## 1.3 Event Types

### **Model-Level Events**

```
PromptEvent
ModelResponseEvent
ModelErrorEvent
```

### **Tool-Level Events**

```
ToolInvocationEvent
ToolResultEvent
ToolErrorEvent
```

### **VFS Events**

```
VFSChangeEvent
VFSSnapshotEvent
```

### **Security Events**

```
SecurityViolationEvent
SandboxIntrusionEvent
PermissionDeniedEvent
```

### **Agent Events**

```
AgentStartEvent
AgentStepEvent
AgentFinishEvent
```

---

## 1.4 History Log

Stored at:

```
workspace/<project>/history.log
```

### Append-only

No event may be removed or rewritten.

### Use cases

* audit
* debugging
* replay
* reproducibility
* agent introspection

---

# 2. Virtual File System (VFS)

The VFS manages project files, versions, diffs, snapshots, and metadata.  
It is the backbone of coding workflows inside Arium.

---

## 2.1 Directory Layout

```
workspace/
  projectId/
    files/            # actual project files
    snapshots/        # full state snapshots
    history.log       # event bus trace
    config.json       # project configuration
```

---

## 2.2 File Operations (Built-in)

### **vfs.read(path)**

Returns file content.

### **vfs.write(path, content)**

Writes to file, generates diff, creates version entry.

### **vfs.delete(path)**

Removes file and logs event.

### **vfs.diff(a, b)**

Computes difference between snapshot A and B.

---

## 2.3 Versioning Model

Every write creates a new version ID:

```
ver-001
ver-002
ver-003
```

Each version stores:

```
content
timestamp
author (agent/tool/user)
diff (from previous)
hash
```

---

## 2.4 Snapshot System

Snapshots are captured at:

* agent completion
* tool groups
* manual user save
* milestones defined in config

Stored as:

```
snapshots/snap-<ulid>.json
```

Snapshots enable:

* rollback
* reproducibility
* audit
* diffing between major states

---

## 2.5 Diff Engine

Diffs are calculated line-by-line:

```
+ added line
- removed line
~ modified line
```

Future improvement: **AST-aware diffs for TS/JS/Python**.

---

# 3. Model Adapter Layer

The Model Adapter Layer provides a uniform interface to multiple LLM providers.

It ensures:

* consistent request format
* optional streaming
* model switching
* compatibility with tool-enabled models
* standard error handling

---

## 3.1 Adapter Interface

```typescript
interface AriumModel {
  generate(prompt: string, options?: object): Promise<ModelResponse>;
  stream(prompt: string, options?: object): AsyncGenerator<ModelChunk>;
  tools?: ToolSpec[];
}
```

Adapters wrap provider-specific protocols.

---

## 3.2 Supported Providers

### ✔ **OpenAI**

`gpt-4o-mini`, `gpt-4o`, `gpt-4.1`, etc.

### ✔ **Google Gemini**

`gemini-2.0-*`

### ✔ **Ollama**

Runs local inference.

### ✔ **TGI Servers**

Text Generation Inference over REST/WebSocket.

### ✔ **Custom HTTP Endpoints**

For private or experimental models.

---

## 3.3 Unified Request Format

The agent sends prompts via:

```json
{
  "messages": [...],
  "tools": [...],
  "temperature": 0.0,
  "max_tokens": 2048
}
```

Adapters translate this into model-specific calls.

---

## 3.4 Normalized Response Format

**Example result:**

```json
{
  "type": "final",
  "content": "Here is your answer...",
  "usage": {
    "prompt_tokens": 120,
    "completion_tokens": 80
  }
}
```

### Tool call response format:

```json
{
 "type": "tool",
 "tool": "fs.write",
 "arguments": { ... }
}
```

---

## 3.5 Streaming Mode

If model supports streaming:

```typescript
for await (const chunk of model.stream(prompt)):
    emit ChunkEvent
```

Chunk types:

* `text-delta`
* `tool-delta`
* `completion-end`

Streaming is fully reflected in Event Bus.

---

## 3.6 Error Handling

All errors normalized to:

```json
{
 "type": "ModelError",
 "provider": "openai",
 "message": "rate limit",
 "status": 429
}
```

Very important for observability & agent reliability.

---

# 4. Data Flow Between Core Systems

```
         ┌──────────────┐
         │    UI Shell   │
         └───────▲───────┘
                 │
                 │ user actions
                 ▼
        ┌───────────────────────┐
        │       Event Bus       │
        └───────▲──────────────┘
                │ events
                ▼
     ┌────────────────────┐
     │    Agent Core      │
     └──────▲─────────────┘
            │ tool calls / prompts
            ▼
     ┌────────────────────┐
     │   Tool Engine      │
     └──────▲─────────────┘
            │ writes
            ▼
     ┌────────────────────┐
     │        VFS         │
     └────────────────────┘

     ┌────────────────────┐
     │ Model Adapter Layer│
     └────────────────────┘
```

Everything that happens — is recorded in `history.log`.

---

# 5. Future Extensions

### Event Bus

* remote event routing
* event indexing for analytics
* replay-driven debugging

### VFS

* semantic diffs
* merge conflicts
* Git integration layer

### Model Adapter Layer

* WASM inference
* agent-side model distillation
* auto-benchmarking for latency/cost

---

