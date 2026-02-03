# Arium Agent Core — Technical Specification

**Version:** 1.0  
**Authors:** Bogdan Marcen & ChatGPT 5.1 (AI Co-Developer)

The Agent Core is the heart of Arium's reasoning system.  
It coordinates model calls, tool executions, memory, task planning, and iterative refinement.

This document defines the internal architecture, execution flow, subsystems, and extensibility mechanisms of Arium's agent engine.

---

# 1. Purpose of the Agent Core

Arium agents are designed to:

* break tasks into actionable steps
* reason iteratively and autonomously
* call tools safely and deterministically
* update context as new information appears
* produce explainable traces
* ensure fully auditable behavior via Event Bus

The Agent Core transforms raw LLM outputs into structured actions and coherent workflows.

---

# 2. High-Level Architecture Diagram

```
┌───────────────────────────────────────────────┐
│                Arium Agent Core               │
│  Planner • Reasoning Loop • Memory • FC-Handler │
└─────────────────▲───────────────▲─────────────┘
                  │               │
         Agent Context      Event Bus (History)
                  │               │
                  ▼               ▼
      ┌───────────────────────────────┐
      │         Model Adapter         │
      │ generate() / stream()         │
      └────────────────▲──────────────┘
                       │
                       │ Model Output
                       ▼
              ┌───────────────────┐
              │   Tool Engine     │
              └───────────────────┘
```

---

# 3. Agent Components

The agent consists of four key subsystems:

### **3.1 Planner**

Breaks the initial instruction into:

* goals
* steps
* tool requirements
* expected success criteria

Planners may be model-driven or rule-based.

---

### **3.2 Memory**

Two main types:

#### **Ephemeral Memory**

Lives only within a single reasoning loop and contains:

* last model response
* tool results
* agent thoughts
* partial outputs

It resets after task completion.

#### **Long-Term Memory** *(future)*

Stores domain knowledge or reusable concepts.

---

### **3.3 Function-Call Handler (fc-handler)**

Interprets structured model outputs of the form:

```json
{
  "tool": "fs.write",
  "arguments": { ... }
}
```

It ensures:

* schema validation
* safe execution via Tool Engine
* integration of tool results into the reasoning loop

---

### **3.4 Agent Context**

A dynamic object containing:

```
user input
conversation history
model outputs
tool results
memory entries
task metadata
partial reasoning steps
```

Used to build the next prompt to the LLM.

---

# 4. Reasoning Loop

The reasoning loop is the core iterative engine.

---

## 4.1 Loop Overview

```
1. Receive initial user task
2. Planner processes request → task plan
3. Generate model output using context
4. If output contains tool call:
       - execute tool
       - append result to context
       - continue loop
5. If output is final answer:
       - exit loop
6. Stop when:
       - max steps reached
       - success condition met
       - agent detects completion
```

---

# 5. Detailed Execution Flow

```
┌───────────────────────────────────────────┐
│            Step 0 — Initialize            │
└───────────────────────────────────────────┘
   ↓ Create agent context
   ↓ Load planner rules
   ↓ Emit AgentStartEvent

┌───────────────────────────────────────────┐
│            Step 1 — Planning              │
└───────────────────────────────────────────┘
   ↓ Planner analyzes task
   ↓ Identifies required tools / subtasks
   ↓ Adds plan to context

┌───────────────────────────────────────────┐
│            Step 2 — Model Step            │
└───────────────────────────────────────────┘
   ↓ Build LLM prompt from context
   ↓ ModelAdapter.generate() or .stream()
   ↓ Normalize response

┌───────────────────────────────────────────┐
│       Step 3 — Tool or Answer?            │
└───────────────────────────────────────────┘
IF response includes tool call:
      → go to Step 4
ELSE:
      → final answer → Step 6

┌───────────────────────────────────────────┐
│        Step 4 — Tool Execution            │
└───────────────────────────────────────────┘
   ↓ fc-handler validates call
   ↓ Tool Engine executes
   ↓ Result appended to context
   ↓ Emit ToolInvocationEvent / ToolResultEvent
   ↓ Continue loop

┌───────────────────────────────────────────┐
│        Step 5 — Loop Control              │
└───────────────────────────────────────────┘
   ↓ Check stop conditions:
       - max steps
       - success criteria
       - no new info
       - explicit completion
   ↓ If continue → Step 2

┌───────────────────────────────────────────┐
│        Step 6 — Finalization              │
└───────────────────────────────────────────┘
   ↓ Emit AgentFinishEvent
   ↓ Return final output
```

---

# 6. Prompt Construction System

Agent prompts are dynamically assembled using:

* system rules
* user input
* event history
* tool results
* relevant memory
* plan metadata

**Example simplified prompt:**

```
SYSTEM:
You are Arium agent...

PLAN:
- read file
- modify content
- write updated file

TOOL RESULTS SO FAR:
fs.read → success, 120 lines

USER INPUT:
"Refactor this file..."
```

Prompt templates are modular and overridable.

---

# 7. Model Output Parsing

LLM responses are parsed by the Response Interpreter:

### Accepted output types:

#### 1. **Final Answer**

Free-form text.

#### 2. **Tool Call**

Valid JSON object:

```json
{
 "tool": "fs.read",
 "arguments": { "path": "src/index.ts" }
}
```

#### 3. **Chain Step** *(thinking)*

For internal reasoning trace (not shown to user).

---

# 8. Stopping Conditions

Agents stop when any of the following are true:

* `max_steps` exceeded
* `stop_tokens` detected
* success criteria matched:

  * file updated
  * tests pass
  * output confirmed
* planner declares task complete

**Default max steps:** **20**

---

# 9. Error Model

Errors are normalized to:

```json
{
 "type": "AgentError",
 "stage": "planning" | "model" | "tool" | "context",
 "message": "...",
 "stack": "..."
}
```

**Typical cases:**

* invalid tool call
* malformed model output
* loop with no progress
* planner failure
* context overflow

Errors are sent to Event Bus.

---

# 10. Extending Agent Behavior

Arium supports custom agent configurations:

```json
{
  "id": "default-agent",
  "mode": "reasoning-loop",
  "model": {
      "adapter": "openai",
      "model": "gpt-4o-mini"
  },
  "memory": {
      "type": "ephemeral",
      "max_tokens": 1024
  },
  "stop_conditions": {
      "max_steps": 20
  }
}
```

You can override:

* planner
* memory module
* loop controller
* prompt builder
* tool call handler

This enables research into autonomous agents.

---

# 11. Example Reasoning Trace (Simplified)

```
User: "Add a HelloWorld class to src/main.ts"

→ Step 1: Planner  
Plan:
 - read src/main.ts
 - append class
 - write file

→ Step 2: Model Output  
{
 "tool": "fs.read",
 "arguments": { "path": "src/main.ts" }
}

→ Step 3: Tool Output  
{ ok: true, data: "file content..." }

→ Step 4: Model Output  
"Here is the updated content..."
{
  "tool": "fs.write",
  "arguments": {
    "path": "src/main.ts",
    "content": "..."
  }
}

→ Step 5: Success  
Agent returns: "The class has been added."

```

---

# 12. Future Extensions

### Multi-Agent Collaboration

Agents communicating via shared memory.

### Reusable Skills

Store and reuse reasoning sequences.

### Goal-Oriented Agents

Agents with autonomous planning beyond human instructions.

### Context-Limited Execution

Agents run in constrained scopes for safety.

---

