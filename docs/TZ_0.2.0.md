# 🚀 **ТЕХНІЧНЕ ЗАВДАННЯ (ТЗ) ДЛЯ ARIUM 0.2.0**

## *System Stability, Model Layer, Debugging & Developer Experience Release*

---

# 🔷 1. Загальний опис

Цей реліз спрямований на:

* стандартизацію роботи моделей (OpenAI / Gemini / Ollama)
* підвищення стабільності агента
* розширення Tool Engine
* додавання діагностичних інструментів
* покращення developer experience
* поліпшення роботи контексту агента
* забезпечення відтворюваності reasoning-поведінки

Milestone 0.2.0 базується на фундаменті з 0.1.x (security hardening, безпечні раннери, строгі типи).

---

# 🔷 2. Обсяг робіт

Milestone розбитий на 6 блоків:
A — Model Layer
B — Tool Engine
C — Observability & Debug
D — AgentCore evolution
E — Testing
F — Developer Experience

Кожен блок містить задачі, технічну реалізацію та критерії приймання.

---

# 🔷 BLOCK A — Model Layer Improvements (P0)

## **A1. Unified ModelAdapter API**

📌 Проблема: адаптери моделей мають несумісні сигнатури.

📌 Ціль: створити єдину специфікацію.

### **Технічне завдання:**

Створити:

```ts
interface ModelAdapter {
  id: string;
  supportsStreaming: boolean;

  generate(input: ModelInput): Promise<Result<ModelOutput>>;
  stream?(input: ModelInput): AsyncGenerator<ModelChunk>;
}
```

Стандартизувати:

* помилки → `ModelError`
* output → JSON-структура
* logging → EventBus
* retry behavior

---

## **A2. Retry/backoff система**

### **Вимоги:**

* exponential backoff: 200ms → 500ms → 1s → 2s → 3s
* retry тільки при transient errors
* максимум 5 retry
* логування у EventBus

---

## **A3. Модельні профілі**

### Потрібно додати конфіг:

```ts
type ModelProfile = "fast" | "smart" | "cheap" | "secure";
```

І визначити:

* temperature
* model name
* max_tokens
* safety параметри

---

# 🔷 BLOCK B — Tool Engine Expansion (P0)

## **B1. Standard Tool Schema**

Створити:

```ts
interface ToolSchema {
  name: string;
  description: string;
  input: ZodSchema;
  output: ZodSchema;
  permissions: Permission[];
}
```

🔹 Автоматична валідація
🔹 Дефолтні дозволи
🔹 Перевірка input/output

---

## **B2. Auto-generated tool documentation**

Нова команда:

```bash
arium tools:docs
```

Генерує Markdown-файли:

```
/docs/tools/<toolname>.md
```

---

## **B3. Tool Sandbox Telemetry**

Збирати:

* exec time
* memory usage (для Python)
* JS VM sandbox usage
* errors
* loop detection events

---

# 🔷 BLOCK C — Observability & Debug Layer (P1)

## **C1. Debug Dashboard (mini UI)**

Маленький lightweight dashboard:

* перегляд EventBus в реальному часі
* перегляд agent context
* VFS explorer
* tool logs
* step-by-step reasoning

Формат: React + WebSocket.

---

## **C2. Debug middleware**

Додає метрики:

* підсумки reasoning
* кількість tool calls
* кількість model calls
* час кожного кроку агента
* статистика контексту

---

# 🔷 BLOCK D — AgentCore Evolution (P1)

## **D1. Multiple reasoning strategies**

Потрібно реалізувати стратегічний модуль:

```ts
type ReasoningMode = "react" | "plan_execute" | "tool_first" | "minimal";
```

І додати підтримку:

* динамічного вибору стратегії
* fallback при помилці

---

## **D2. Context compression module**

Потрібно реалізувати:

### Алгоритми:

* L2 summarization
* grouping
* event condensation

### API:

```ts
interface ContextCompressor {
  compress(messages: AgentMessage[]): Promise<AgentMessage[]>;
}
```

---

## **D3. Stop Conditions (production-ready)**

Формалізувати:

```ts
type StopCondition =
  | { type: "max_steps"; value: number }
  | { type: "tool_call"; name: string }
  | { type: "pattern"; regex: RegExp };
```

AgentCore має:

* зчитувати ці умови
* зупиняти reasoning коректно

---

# 🔷 BLOCK E — Testing & Reliability (P0/P1)

## **E1. Golden tests**

Потрібно створити систему:

```
test/golden/<case>
  input.json
  expected.json
```

Агент запускається → output порівнюється з expected.

---

## **E2. Multi-model compatibility**

Тести для:

* OpenAI
* Gemini
* Ollama

---

## **E3. Tool Engine stress tests**

Включити:

* 1000 паралельних tool calls
* max payloads
* sandbox attack attempts

---

# 🔷 BLOCK F — Developer Experience (P2)

## **F1. CLI Enhancements**

Розширити CLI:

```bash
arium init
arium run
arium agent:debug
arium tools:list
arium tools:add
arium tools:docs
```

---

## **F2. Logger V2**

Реалізувати стилізацію logів:

* кольори
* source tags
* timestamps
* json mode для машин

---

## **F3. Auto-generated documentation**

Команда:

```bash
arium docs:generate
```

Створює:

* API docs
* Tool docs
* Model Adapter docs
* Architecture diagrams

---

# 🔷 3. Критерії приймання milestone 0.2.0

### ✔ Unified Model Adapter API стабільний

### ✔ Контекст агента стискається при перевищенні меж

### ✔ Debug Dashboard працює

### ✔ Усі інструменти мають Zod-schema

### ✔ Новий CLI працює без помилок

### ✔ Всі модулі проходять strict type-check

### ✔ 90% тестів пройдено

### ✔ Tool runners стабільні під навантаженням

### ✔ Arium працює мінімум з 3 різними моделями
