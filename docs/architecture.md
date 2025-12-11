# Arium — System Architecture Overview

**Version:** 1.0  
**Authors:** Bogdan Marcen & ChatGPT 5.1 (AI Co-Developer)

Arium is a modular, local-first AI development environment designed to combine code editing, tool execution, agent reasoning, and multi-model integration into a single coherent ecosystem.

This document describes the architectural principles, internal components, data flow, execution lifecycle, and extensibility mechanisms of the system.

---

# 1. Architectural Principles

Arium is built around several core principles:

### **Local-first execution**

Agents, tools and model calls are executed locally whenever possible, minimizing external dependencies and improving auditability.

### **Deterministic reasoning**

Every model output, tool call, state mutation and error event is logged in the Event Bus history as an append-only trace.

### **Modularity and separation of concerns**

Each subsystem (VFS, tools, models, agents, UI) is isolated and communicates only through typed events.

### **Security-first sandboxing**

Tools run with explicit permissions and strict execution boundaries.

### **Extensibility for researchers and engineers**

New adapters, tools, models, runners and UI modules can be plugged in without modifying the core.

---

# 2. High-Level Architecture Diagram

```
┌──────────────────────────────────────────────────────────────┐
│                          UI Shell (React)                    │
│    Editors • Console • File Explorer • Agent Control Panel   │
└───────────────▲───────────────────────────────▲──────────────┘
                │                                │
                │ UI Events                      │ Observability
                │                                │
        ┌───────┴────────────────────────────────┴─────────────┐
        │                Arium Event Bus (Core)                 │
        │   Central asynchronous pub/sub pipeline for:          │
        │   - prompts / model outputs                           │
        │   - tool invocations / results                        │
        │   - VFS changes                                       │
        │   - system logs & security events                     │
        └───────┬──────────────────────────────────┬────────────┘
                │                                  │
                │                                  │
     ┌──────────▼─────────┐               ┌────────▼───────────┐
     │     Agent Core     │               │   Virtual File Sys  │
     │ Planning • Memory  │               │      Versioning      │
     │ Reasoning Loop      │               │ Snapshots • Diffs   │
     └────────▲───────────┘               └────────▲────────────┘
              │                                      │
              │ Tool Requests                        │ File Events
              │                                      │
     ┌────────▼───────────┐               ┌──────────▼──────────┐
     │      Tool Engine   │               │   Model Adapter      │
     │ Runners • Schema   │               │ OpenAI • Gemini      │
     │ Validation • Perms │               │ Ollama • TGI • Local │
     └────────▲───────────┘               └──────────▲──────────┘
              │                                      │
              │ Execution                            │ Model Calls
              │                                      │
              └─────────────► Append-Only History ◄──┘
```

---

# 3. Subsystems

## 3.1 Arium Event Bus

The Event Bus is the backbone of Arium.  
It provides asynchronous message passing between all components.

### Responsibilities

* Transport model prompts/responses
* Broadcast tool invocations/results
* Notify UI about state changes
* Maintain append-only `history.log`
* Validate event schemas

### Event Types

```
PromptEvent
ModelResponseEvent
ToolInvocationEvent
ToolResultEvent
VFSChangeEvent
SecurityEvent
SystemErrorEvent
```

Each event is a JSON object with strict type validation.

---

# 4. Virtual File System (VFS)

Arium's VFS is designed for:

* ultra-fast local file access
* lightweight versioning
* granular diffs
* autosave
* integration with cloud/local drives

### Directory Schema

```
workspace/
  projectId/
     files/
     history.log
     snapshots/
     config.json
```

### Diff Engine

A built-in line-based diff system (later extended to AST-aware diffs for code).

### Snapshot System

At key events (save, agent commit, tool write), VFS creates snapshots for rollback and auditability.

---

# 5. Tool Engine

Arium tools are defined in JSON/YAML and executed via isolated runners.

### Tool JSON Structure

```json
{
  "id": "string",
  "name": "string",
  "runner": "builtin" | "js" | "py",
  "permissions": [...],
  "schema": { ... }
}
```

### Runners

* **builtin** — internal low-level operations
* **js-runner** — Node/Deno sandbox
* **py-runner** — Python sandbox

### Tool Lifecycle

1. Schema validation
2. Permission checking
3. Sandboxed execution
4. Structured output
5. Event Bus emission

---

# 6. Model Adapter Layer

A unified interface for querying different LLM providers.

### Implemented Adapters

* **OpenAI**
* **Google Gemini**
* **Ollama** (local models)
* **TGI Servers**
* **Custom endpoints**

### Adapter Interface

```typescript
interface AriumModel {
  generate(prompt: string, options?): Promise<ModelResponse>;
  stream(prompt: string, options?): AsyncGenerator<ModelChunk>;
  tools?: ToolSpec[];
}
```

Adapters translate provider-specific APIs into a common schema.

---

# 7. Agent Core (Reasoning Engine)

At the heart of Arium is the Agent Core — a multi-step reasoning loop with optional autonomy.

### Internal Modules

* **planner.ts** — breaks tasks into subtasks
* **fc-handler.ts** — tool/function call handler
* **memory.ts** — contextual + ephemeral memory
* **history.ts** — agent awareness of past actions

### Reasoning Loop (Pseudo-Flow)

```
1. Receive user prompt
2. Generate model output
3. Check for tool call
4. If tool call → dispatch to Tool Engine
5. Receive tool result
6. Append to reasoning context
7. Generate next step
8. Repeat until:
     - success criteria met
     - max_steps reached
     - user interrupts
```

### Success Criteria Examples

* Tests pass
* File updated correctly
* Task confirmed by user

---

# 8. UI Shell (React)

UI is lightweight and reactive, connected to the Event Bus.

### Key Components

* **Code Editor** (Monaco)
* **VFS Explorer**
* **Agent Console** (streaming logs)
* **Tool Inspector**
* **Model Switcher**
* **Diff Viewer**

### UI Data Flow Example

```
User Action → UI Event → Event Bus → Core Execution → Event Bus → UI Update
```

---

# 9. Security Architecture

Arium applies layered security:

### 1. FS Scoping

Tools may access only allowed paths.

### 2. Permission Matrix

Tool JSON must explicitly specify allowed operations.

### 3. Sandboxing

JS and Python run isolated, resource-limited.

### 4. Injection Detection

Prompts and tool parameters validated for hostile signatures.

### 5. Append-only audit

No silent modification of logs.

---

# 10. Extensibility & Plugin System

Developers can extend Arium by adding:

* custom tools
* new model adapters
* UI components
* workspace connectors
* agent behaviours

The system is intentionally unopinionated — most subsystems expose clean interfaces.

---

# 11. Data Flow Reference

### Model → Tool → VFS Pipeline Example

```
[User Prompt]
      ↓
[Agent Planner]
      ↓
[Model Request]
      ↓
[LLM Output (tool call)]
      ↓
[Tool Engine]
      ↓
[VFS Write]
      ↓
[Event Bus Broadcast]
      ↓
[UI Update + History Entry]
```

---

# 12. Roadmap Summary (Technical)

### Phase 1 (MVP)

* Basic VFS
* Tool Engine v1
* Agent Loop
* OpenAI Adapter
* Base UI Shell

### Phase 2

* Python/JS sandboxes
* Model switching
* Diff editor

### Phase 3

* Git integration
* Offline inference
* Plugin marketplace

### Phase 4

* RBAC
* Enterprise backend
* Advanced observability

---

# 13. Appendix A — ASCII Diagram: Detailed Reasoning Loop

```
┌───────────────────────────────┐
│          User Input           │
└───────────────┬───────────────┘
                │
                ▼
      ┌───────────────────┐
      │   Agent Planner   │
      └───────┬───────────┘
              │
              ▼
      ┌───────────────────┐
      │   Model Adapter   │
      └───────┬───────────┘
              │
              ▼
      ┌───────────────────────────┐
      │ Does output contain tool? │
      └──────────────┬────────────┘
                     │ yes
                     ▼
           ┌───────────────────┐
           │    Tool Engine    │
           └─────────┬─────────┘
                     │
                     ▼
           ┌───────────────────┐
           │     Tool Output   │
           └─────────┬─────────┘
                     │
                     ▼
      ┌──────────────────────────┐
      │ Append to Agent Context  │
      └──────────────────────────┘
                     │
                     ▼
      ┌──────────────────────────┐
      │  Stopping Conditions?    │
      └───────┬───────────┬─────┘
              │ no         │ yes
              ▼            ▼
     (Iterate again)   (Return final answer)
```
