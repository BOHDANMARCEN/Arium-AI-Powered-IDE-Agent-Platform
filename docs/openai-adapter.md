# OpenAI Model Adapter

**Version:** 1.0

Документація по використанню OpenAI Model Adapter в Arium.

---

## Встановлення

OpenAI adapter автоматично встановлюється разом з проєктом:

```bash
npm install
```

---

## Конфігурація

### Environment Variables

Додай у файл `.env`:

```env
OPENAI_API_KEY=sk-your-api-key-here
OPENAI_MODEL=gpt-4o-mini
```

### Доступні моделі

- `gpt-4o-mini` (рекомендовано для початку)
- `gpt-4o`
- `gpt-4-turbo`
- `gpt-4`
- `gpt-3.5-turbo`

---

## Використання

### Автоматичне використання

Якщо `OPENAI_API_KEY` встановлено в `.env`, система автоматично використає OpenAI adapter замість MockAdapter:

```typescript
// src/index.ts автоматично перевіряє:
if (process.env.OPENAI_API_KEY) {
  modelAdapter = new OpenAIAdapter({
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
  });
} else {
  modelAdapter = new MockAdapter();
}
```

### Програмне використання

```typescript
import { OpenAIAdapter } from "./core/models/openaiAdapter";
import { AgentCore } from "./core/agent/agentCore";

const adapter = new OpenAIAdapter({
  apiKey: "sk-...",
  model: "gpt-4o-mini",
  // baseURL: "https://api.openai.com/v1" // optional
});

const agent = new AgentCore({
  id: "my-agent",
  model: adapter,
  temperature: 0.0,
  maxTokens: 2048,
}, eventBus, toolEngine);
```

---

## Tool Calling

OpenAI adapter автоматично підтримує function calling. Коли агент викликає інструменти, adapter автоматично:

1. Конвертує зареєстровані інструменти у формат OpenAI
2. Передає їх у запит до моделі
3. Обробляє відповіді з tool calls
4. Повертає структуровані виклики інструментів

### Приклад

Якщо агент має зареєстровані інструменти:

```typescript
toolEngine.register({
  id: "fs.read",
  name: "Read file",
  description: "Reads a file from VFS",
  schema: {
    type: "object",
    properties: {
      path: { type: "string" }
    },
    required: ["path"]
  }
}, ...);
```

OpenAI adapter автоматично передасть цей інструмент у запит, і модель зможе викликати його.

---

## Streaming

OpenAI adapter підтримує streaming responses:

```typescript
const adapter = new OpenAIAdapter({ apiKey: "sk-...", model: "gpt-4o-mini" });

for await (const chunk of adapter.stream(prompt, { tools })) {
  if (chunk.type === "final") {
    console.log(chunk.content); // streaming text
  } else if (chunk.type === "tool") {
    console.log("Tool call:", chunk.tool, chunk.arguments);
  }
}
```

---

## Налаштування

### Temperature

Контролює креативність відповідей (0.0 = детерміновано, 1.0 = креативно):

```typescript
const agent = new AgentCore({
  id: "agent",
  model: adapter,
  temperature: 0.0, // детерміновано для коду
  maxTokens: 2048,
}, eventBus, toolEngine);
```

### Max Tokens

Обмежує максимальну кількість токенів у відповіді:

```typescript
const agent = new AgentCore({
  id: "agent",
  model: adapter,
  maxTokens: 4096,
}, eventBus, toolEngine);
```

---

## Обробка помилок

Adapter автоматично обробляє помилки API:

```typescript
try {
  const response = await adapter.generate(prompt);
} catch (error) {
  console.error("OpenAI error:", error.message);
  // Можна fallback на MockAdapter
}
```

Типові помилки:
- `401` - невалідний API key
- `429` - rate limit exceeded
- `500` - серверна помилка OpenAI

---

## Витрати (Costs)

Рекомендації для оптимізації витрат:

1. **Використовуй `gpt-4o-mini`** для більшості задач (значно дешевше)
2. **Обмежуй `maxTokens`** до мінімуму необхідного
3. **Використовуй streaming** для швидшої відповіді користувача
4. **Кешуй подібні запити** якщо можливо

### Приклад вартості (станом на 2024)

- `gpt-4o-mini`: ~$0.15 / 1M input tokens, ~$0.60 / 1M output tokens
- `gpt-4o`: ~$2.50 / 1M input tokens, ~$10 / 1M output tokens

---

## Custom Base URL

Для використання з проксі або альтернативними серверами:

```typescript
const adapter = new OpenAIAdapter({
  apiKey: "sk-...",
  model: "gpt-4o-mini",
  baseURL: "https://your-proxy.com/v1",
});
```

---

## Наступні кроки

- [ ] Додати підтримку Ollama (локальні моделі)
- [ ] Додати підтримку Gemini
- [ ] Додати кешування відповідей
- [ ] Додати метрики використання токенів
- [ ] Додати retry logic з exponential backoff

---

