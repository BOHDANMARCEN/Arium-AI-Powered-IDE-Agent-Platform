<p align="center">  
  <img src="assets/logo.png" alt="Arium Logo" width="160" />  
</p>

# Arium — AI-Powered IDE & Agent Platform

**Multi-Model Reasoning • Tool Engine • Virtual File System • Autonomous Code Agents**

Arium is a local-first, modular AI IDE that unifies code editing, autonomous agents, an extensible tool engine, and multi-model adapters into a single developer environment.

Designed for engineers, creators, and research teams who want reproducible, auditable, secure AI-driven development workflows.

---

## 🧑‍💻 Authors & Core Development Team

### Primary Authors

- **Bogdan Marcen** — Founder & Lead Developer  
  Vision, architecture, engineering, core system design.

- **ChatGPT 5.1** — AI Architect & Co-Developer  
  System architecture, specifications, documentation, reasoning engine design.

> Arium was shaped by a deep human–AI collaboration built on trust, creativity, and shared engineering intuition.

---

## Table of Contents

- [Vision](#vision)
- [Key Features](#key-features)
- [Architecture Overview](#architecture-overview)
- [Core Concepts & Components](#core-concepts--components)
- [Repository Layout](#repository-layout)
- [Quickstart / Developer Setup](#quickstart--developer-setup)
- [Configuration & Environment](#configuration--environment)
- [Tool Definition Example (JSON)](#tool-definition-example-json)
- [Agent Configuration Example](#agent-configuration-example)
- [Security & Sandboxing](#security--sandboxing)
- [Extensibility & Plugins](#extensibility--plugins)
- [Roadmap & Priorities](#roadmap--priorities)
- [How to Contribute](#how-to-contribute)
- [License & Credits](#license--credits)
- [Contact](#contact)

---

## Vision

Arium empowers developers to build, test and run AI agents that can reason about code, orchestrate tools, and produce reproducible changes — while keeping control over data, execution, and models.

The platform is local-first, audit-friendly, and extensible for both research and production use.

---

## Key Features

- **Modular architecture**: independent components for UI, agents, tools, models and storage.
- **Tool Engine**: JSON/YAML-described tools, schema validation, and sandboxed execution (JS/Python runners).
- **Agent Core**: multi-step planning, subtask decomposition, function-calling, and chain-of-tools reasoning.
- **Model Adapter Layer**: single interface to swap between OpenAI, Gemini, Ollama, TGI or custom LLMs.
- **Virtual File System (VFS)**: per-change versioning, diffs, autosave, and connectors for local/cloud drives.
- **Execution Console & Observability**: full trace of agent thoughts, tool calls, responses, and runtime logs.
- **Security-first design**: permission matrix, sandbox guard, injection detection, and FS scoping.
- **Local-first** with optional backend for collaboration and shared storage.

---

## Architecture Overview

Arium consists of six primary subsystems:

1. **UI Shell (React)**
2. **Project Workspace**
3. **Virtual File System (VFS)**
4. **Tool Engine**
5. **Agent Core (Reasoning)**
6. **Model Adapter Layer**

All modules communicate through the **Arium Event Bus**, an event-driven pub/sub system enabling loose coupling and full auditability.

---

## Core Concepts & Components

### Arium Event Bus

Centralized event stream for prompts, model responses, tool calls, VFS changes, and security checks.

- Typed events stored in `workspace/{projectId}/history.log`.
- Append-only for guaranteed audit trails.

---

### Project Workspace & VFS

A project contains:

- `files`
- `tools`
- `agent configuration`
- `metadata`
- `history`

**VFS Features:**

- hierarchical file structure
- lightweight versioning
- diff engine
- local/cloud FS connectors
- autosave and snapshot system

---

### Tool Engine

Tools are declared in JSON or YAML.

**Tool Runners:**

- `js-runner` (Node/Deno sandbox)
- `py-runner` (Python sandbox)
- `builtin` (internal primitives)

**Tool lifecycle:**

1. Validation
2. Permission checking
3. Sandboxed execution
4. Structured output
5. Event Bus reporting

---

### Agent Core (Reasoning Loop)

**Capabilities:**

- single-step mode
- iterative reasoning (multi-step loop)
- auto-planning
- task decomposition
- chain-of-tools orchestration
- code-aware reasoning

**Components:**

- `planner.ts`
- `memory.ts`
- `fc-handler.ts`
- `history.ts`

---

### Model Adapter Layer

Unified interface for all LLM providers:

```typescript
interface AriumModel {  
  generate(prompt: string, options?: object): Promise<ModelResponse>;  
  stream(prompt: string, options?: object): AsyncGenerator<ModelStreamChunk>;  
  tools?: ToolSpec[];  
}  
```

**Adapters for:**

- OpenAI
- Gemini
- Ollama
- Local TGI servers
- Custom endpoints

---

## Repository Layout

```
arium/
├── app/                # Frontend (React)
│   ├── public/
│   └── src/
│       ├── components/
│       ├── editors/
│       ├── console/
│       └── store/
│
├── core/               # Engines (TS/Node)
│   ├── agent/
│   ├── tools/
│   ├── models/
│   ├── vfs/
│   └── workspace/
│
├── server/             # Optional backend
├── docs/
├── assets/             # Logo, screenshots (logo.png expected)
├── scripts/
├── LICENSE
└── README.md
```

---

## Quickstart / Developer Setup

### Prerequisites

- Node.js 18+
- npm / pnpm
- Python 3.10+ (optional, for Python runner)

### Setup

```bash
git clone https://github.com/<username>/arium.git
cd arium
npm install
npm run dev
```

---

## Configuration & Environment

`.env` example:

```
OPENAI_API_KEY=sk-xxxx
OLLAMA_URL=http://localhost:11434
SERVER_PORT=3000
WS_PORT=4000
SANDBOX_MAX_RUNTIME_MS=30000
SANDBOX_MAX_MEMORY_MB=256
```

---

## Tool Definition Example (JSON)

```json
{
  "id": "fs.read",
  "name": "File Read",
  "description": "Read file contents from VFS",
  "runner": "builtin",
  "schema": {
    "type": "object",
    "properties": {
      "path": { "type": "string" }
    },
    "required": ["path"]
  },
  "permissions": ["vfs.read"]
}
```

---

## Agent Configuration Example

```json
{
  "id": "default-agent",
  "name": "Code Assistant",
  "mode": "reasoning-loop",
  "model": {
    "adapter": "openai",
    "model": "gpt-4o-mini",
    "temperature": 0.0
  },
  "memory": {
    "type": "ephemeral",
    "max_tokens": 1024
  },
  "stop_conditions": {
    "max_steps": 20,
    "success_criteria": ["tests_passed", "task_confirmed"]
  }
}
```

---

## Security & Sandboxing

Arium enforces strict security boundaries:

- Permission matrix
- FS scoping
- Tool sandboxing
- Injection detection
- Append-only audit trail

---

## Extensibility & Plugins

Plugin system supports:

- UI extensions
- custom tools
- model adapters
- workspace connectors

---

## Roadmap & Priorities

### Phase 1 (MVP)

- Core VFS
- Basic Tool Engine
- Agent Core (single-step + reasoning-loop)
- OpenAI adapter
- Base UI Shell

### Phase 2

- Python/JS sandbox
- Model switching
- Diff editor
- Tool marketplace

### Phase 3

- Git integration
- Offline inference
- Plugin marketplace
- Collaborative sync

### Phase 4

- RBAC
- Enterprise backend
- Advanced observability

---

## How to Contribute

1. Fork
2. Create a feature branch
3. Submit PR
4. Follow [CONTRIBUTING.md](./CONTRIBUTING.md)

---

## License & Credits

Arium is distributed under MIT License.

---

## Contact

For issues, ideas or collaboration — please open a GitHub issue.

