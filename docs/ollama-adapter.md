# Ollama Model Adapter

**Version:** 1.0

Документація по використанню Ollama Model Adapter для локального виконання LLM в Arium.

---

## Огляд

Ollama Adapter дозволяє використовувати локальні LLM моделі через [Ollama](https://ollama.ai/) без залежності від зовнішніх API.

### Переваги

- ✅ **Local-first** — працює повністю локально
- ✅ **Безкоштовно** — без API costs
- ✅ **Приватність** — дані не покидають твій комп'ютер
- ✅ **Швидкість** — без мережевих затримок (якщо модель локальна)
- ✅ **Гнучкість** — багато доступних моделей

---

## Встановлення Ollama

### macOS / Linux

```bash
curl -fsSL https://ollama.ai/install.sh | sh
```

### Windows

Завантаж і встанови з [ollama.ai](https://ollama.ai/download)

### Перевірка

```bash
ollama --version
```

---

## Запуск Ollama

```bash
ollama serve
```

Це запустить Ollama сервер на `http://localhost:11434`.

---

## Завантаження моделей

### Популярні моделі

```bash
# Llama 2 (7B) - найпопулярніша
ollama pull llama2

# Llama 2 (13B) - більша, краща якість
ollama pull llama2:13b

# Mistral
ollama pull mistral

# CodeLlama (для коду)
ollama pull codellama

# Phi-2 (Microsoft, компактна)
ollama pull phi
```

### Список доступних моделей

```bash
ollama list
```

### Автоматичне виявлення (auto-discovery)

Arium автоматично визначає встановлені моделі через HTTP API Ollama:

```
GET http://localhost:11434/api/tags
```

- Використовується `/api/tags` (preferred).
- TTL кеш: 30s (щоб не спамити daemon).
- Якщо HTTP недоступний, використовується fallback `ollama list`.

---

## Конфігурація Arium

### Environment Variables

Додай у `.env`:

```env
# Enable Ollama
USE_OLLAMA=true

# Ollama URL (optional, default: http://localhost:11434)
OLLAMA_URL=http://localhost:11434
OLLAMA_HOST=http://localhost:11434

# Model name (optional, default: llama2)
OLLAMA_MODEL=llama2

# Optional allowlist (comma-separated)
OLLAMA_MODEL_ALLOWLIST=gemma-3-abliterated:latest,llama3.2:3b
```

### Default Model Selection

Порядок вибору дефолтної моделі:

1. `defaultModel` у конфігу адаптера
2. `OLLAMA_MODEL`
3. `config/defaultModels.json`
4. перша знайдена модель

Якщо `gemma-3-abliterated:latest` встановлена, вона вибирається за замовчуванням
(якщо не задано явний `defaultModel` або `OLLAMA_MODEL`).

### Пріоритет адаптерів

Arium використовує наступний порядок пріоритетів:

1. **OpenAI** (якщо `OPENAI_API_KEY` встановлено)
2. **Ollama** (якщо `USE_OLLAMA=true` або `OLLAMA_URL` встановлено)
3. **MockAdapter** (fallback для тестування)

---

## Використання

### Автоматичне визначення

Якщо Ollama доступний, Arium автоматично підключиться:

```bash
USE_OLLAMA=true npm run dev
```

### Програмне використання

```typescript
import { OllamaAdapter } from "./core/models/ollamaAdapter";

const adapter = new OllamaAdapter({
  baseURL: "http://localhost:11434",
  model: "llama2",
});

// Check availability
const available = await adapter.isAvailable();
if (!available) {
  console.error("Ollama not available");
}

// List available models
const models = await adapter.listModels();
console.log("Available models:", models);

// Use with agent
const agent = new AgentCore({
  id: "local-agent",
  model: adapter,
}, eventBus, toolEngine);
```

---

## Tool Calling

Ollama не має нативної підтримки function calling, тому Arium використовує prompt engineering:

1. Tools описуються у prompt
2. Модель генерує спеціальний формат: `CALL_TOOL: <name> <json>`
3. Adapter парсить відповідь і витягує tool call

### Приклад

```
Available tools:
- fs.read: Read file from VFS
  Parameters: {"path": "string"}
- fs.write: Write file to VFS
  Parameters: {"path": "string", "content": "string"}

To call a tool, respond with: CALL_TOOL: <tool_name> <json_arguments>
Example: CALL_TOOL: fs.read {"path": "file.txt"}

User: Read the file src/main.ts
Assistant: CALL_TOOL: fs.read {"path": "src/main.ts"}
```

---

## Streaming

Ollama adapter підтримує streaming:

```typescript
const adapter = new OllamaAdapter({ model: "llama2" });

for await (const chunk of adapter.stream(prompt, { tools })) {
  if (chunk.type === "final") {
    console.log(chunk.content); // streaming text
  }
}
```

---

## Налаштування

### Temperature

```typescript
const adapter = new OllamaAdapter({
  model: "llama2",
});

const agent = new AgentCore({
  id: "agent",
  model: adapter,
  temperature: 0.7, // 0.0 = deterministic, 1.0 = creative
}, eventBus, toolEngine);
```

### Max Tokens

```typescript
const agent = new AgentCore({
  id: "agent",
  model: adapter,
  maxTokens: 4096,
}, eventBus, toolEngine);
```

---

## Моделі та Їхні Характеристики

### Llama 2 (7B)

- **Розмір**: ~4GB
- **Швидкість**: Швидка
- **Якість**: Добра
- **Призначення**: Загальні задачі

```bash
ollama pull llama2
```

### Llama 2 (13B)

- **Розмір**: ~7.5GB
- **Швидкість**: Середня
- **Якість**: Краща за 7B
- **Призначення**: Складніші задачі

```bash
ollama pull llama2:13b
```

### CodeLlama

- **Розмір**: ~4GB
- **Швидкість**: Швидка
- **Якість**: Відмінна для коду
- **Призначення**: Програмування

```bash
ollama pull codellama
```

### Mistral

- **Розмір**: ~4GB
- **Швидкість**: Швидка
- **Якість**: Дуже хороша
- **Призначення**: Загальні задачі, альтернатива Llama 2

```bash
ollama pull mistral
```

---

## Performance Tips

### Для кращої швидкості:

1. **Використовуй менші моделі** (7B замість 13B)
2. **Зменши max_tokens** якщо можливо
3. **GPU acceleration** (якщо доступно)
4. **Кешування** — Ollama автоматично кешує

### Для кращої якості:

1. **Використовуй більші моделі** (13B, 34B)
2. **Fine-tuning** моделі під твої задачі
3. **Правильні prompts** — важливіше ніж для GPT

---

## Troubleshooting

### Ollama не знайдено

```bash
# Перевір чи Ollama запущений
curl http://localhost:11434/api/tags

# Запусти Ollama
ollama serve
```

### Модель не знайдена

```bash
# Список встановлених моделей
ollama list

# Завантажити модель
ollama pull llama2
```

### Повільна робота

- Перевір що GPU використовується (якщо доступно)
- Спробуй меншу модель
- Зменши max_tokens

### Погана якість відповідей

- Спробуй більшу модель (13B замість 7B)
- Налаштуй temperature (0.7-0.9 для креативності)
- Покращ prompt engineering

---

## Порівняння з OpenAI

| Функція | OpenAI | Ollama |
|---------|--------|--------|
| Cost | 💰 Платний | 🆓 Безкоштовно |
| Privacy | 🌐 Cloud | 🏠 Local |
| Speed | ⚡ Швидкий | 🐢 Залежить від HW |
| Quality | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| Function Calling | ✅ Native | ⚠️ Prompt-based |
| Setup | ✅ Простий | ⚙️ Потрібно встановити |

---

## Майбутні Покращення

- [ ] Native function calling (коли Ollama додасть підтримку)
- [ ] Model switching без перезапуску
- [ ] Automatic model selection
- [ ] GPU detection and optimization
- [ ] Model caching strategies
- [ ] Fine-tuning support

---

## Рекомендації

### Для Development

Використовуй **MockAdapter** або маленьку модель (phi, llama2:7b) для швидкої ітерації.

### Для Production

Залежить від потреб:
- **Local-first**: Ollama з великою моделлю
- **Cloud-first**: OpenAI GPT-4
- **Hybrid**: Ollama для простих задач, OpenAI для складних

---

## Приклади

### Запуск з Ollama

```bash
# 1. Встанови Ollama
curl -fsSL https://ollama.ai/install.sh | sh

# 2. Запусти Ollama
ollama serve

# 3. Завантаж модель
ollama pull llama2

# 4. Налаштуй .env
echo "USE_OLLAMA=true" >> .env
echo "OLLAMA_MODEL=llama2" >> .env

# 5. Запусти Arium
npm run dev
```

### Перемикання між моделями

```bash
# У .env
OLLAMA_MODEL=llama2:7b    # Для швидкості
OLLAMA_MODEL=llama2:13b   # Для якості
OLLAMA_MODEL=codellama    # Для коду
```

### Приклади моделей (імена з тегами і namespaces)

```bash
OLLAMA_MODEL=gemini-3-flash-preview:cloud
OLLAMA_MODEL=kimi-k2-thinking:cloud
OLLAMA_MODEL=gpt-oss:120b-cloud
OLLAMA_MODEL=huihui_ai/qwen3-abliterated:14b
OLLAMA_MODEL=deepseek-v3.1:671b-cloud
OLLAMA_MODEL=qwen3-coder:480b-cloud
OLLAMA_MODEL=huihui_ai/qwen2.5-1m-abliterated:14b
OLLAMA_MODEL=llama3.2:3b
OLLAMA_MODEL=gpt-oss-20b-quality:latest
OLLAMA_MODEL=gemma-3-abliterated:latest
```

---
