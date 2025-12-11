# Arium Core — Quick Start Guide

Цей документ описує як запустити базову реалізацію Arium Core локально.

## Передумови

- Node.js 18+ 
- npm або pnpm

## Встановлення

1. Встанови залежності:

```bash
npm install
```

2. Налаштуй конфігурацію (опціонально):

Створи файл `.env` на основі `.env.example`:

```bash
cp .env.example .env
```

Відредагуй `.env` та додай свій OpenAI API key (якщо хочеш використовувати OpenAI):

```env
OPENAI_API_KEY=sk-your-key-here
PERSISTENT_STORAGE=true
```

## Запуск

### Режим розробки (з автоматичним перезапуском)

```bash
npm run dev
```

Це запустить сервер на `http://localhost:4000` з:
- REST API ендпоінтами
- WebSocket сервером для real-time подій

### Побудова та запуск production версії

```bash
npm run build
npm start
```

## Структура проєкту

```
src/
├── core/
│   ├── eventBus.ts        # Event Bus з append-only history
│   ├── vfs/
│   │   └── index.ts       # In-memory VFS з версіями та snapshots
│   ├── tool-engine/
│   │   └── index.ts       # Реєстрація та виконання тулів з валідацією
│   ├── models/
│   │   └── mockAdapter.ts # Mock LLM adapter (для dev/testing)
│   └── agent/
│       ├── planner.ts     # Rule-based planner
│       └── agentCore.ts   # Reasoning loop з підтримкою tool calls
├── server/
│   ├── http.ts            # REST API сервер (Express)
│   ├── websocket.ts       # WebSocket сервер для real-time подій
│   ├── routes/
│   │   ├── agent.ts       # Маршрути для агентів
│   │   ├── vfs.ts         # Маршрути для VFS
│   │   ├── events.ts      # Маршрути для подій
│   │   └── tools.ts       # Маршрути для тулів
│   └── index.ts           # Bootstrap сервера
└── index.ts               # Головна точка входу: ініціалізація core + сервер
```

## Як працює система

`src/index.ts` ініціалізує всю систему:

1. Створює EventBus, VFS, ToolEngine
2. Реєструє вбудовані інструменти (`fs.read`, `fs.write`)
3. Створює агента з mock моделью
4. Запускає сервер з REST API та WebSocket

## API Endpoints

### REST API

| Метод  | URL                  | Опис             |
| ------ | -------------------- | ---------------- |
| `POST` | `/agent/run`         | Запустити агента |
| `GET`  | `/vfs/list`          | Список файлів    |
| `GET`  | `/vfs/read?path=...` | Прочитати файл   |
| `POST` | `/vfs/write`         | Записати файл    |
| `GET`  | `/events/history`    | Історія EventBus |
| `GET`  | `/tools/list`        | Список тулів     |
| `POST` | `/tools/invoke`      | Виклик тулза     |

### WebSocket

```
ws://localhost:4000
```

Підключення до WebSocket отримує всі події EventBus в реальному часі:

```json
{
  "type": "event",
  "event": {
    "id": "...",
    "type": "AgentStartEvent",
    "timestamp": 1234567890,
    "payload": { ... }
  }
}
```

## Приклади використання API

### Запуск агента

```bash
curl -X POST http://localhost:4000/agent/run \
  -H "Content-Type: application/json" \
  -d '{"input": "Please read file src/main.ts (CALL: fs.read)"}'
```

### Список файлів

```bash
curl http://localhost:4000/vfs/list
```

### Читання файлу

```bash
curl "http://localhost:4000/vfs/read?path=src/main.ts"
```

### Запис файлу

```bash
curl -X POST http://localhost:4000/vfs/write \
  -H "Content-Type: application/json" \
  -d '{"path": "test.txt", "content": "Hello, Arium!"}'
```

### Історія подій

```bash
curl http://localhost:4000/events/history
```

## Розширення системи

### Security / Sandboxing

Зараз runners виконуються в поточному процесі. Для production:

- Додай VM2 або Deno isolate для JS runners
- Запускай Python/Node runners у контейнерах або окремих процесах
- Додай обмеження пам'яті та часу виконання

### Model Adapters

Заміни `MockAdapter` на реальні адаптери:

- OpenAI API
- Ollama (локальні моделі)
- TGI servers
- Custom HTTP endpoints

Реалізуй методи `generate()` та `stream()` згідно інтерфейсу.

### Persistence

✅ **Persistent Storage вже реалізовано!**

Система автоматично зберігає:
- Події EventBus у `workspace/<project>/history.log`
- Файли VFS у `workspace/<project>/files/`
- Версії файлів у `workspace/<project>/versions/`
- Snapshots у `workspace/<project>/snapshots/`

Для вимкнення persistent storage (in-memory mode):
```env
PERSISTENT_STORAGE=false
```

### Тестування

Додай unit tests для:

- `ToolEngine.invoke()`
- `VFS.write/read()`
- Agent flows

### Frontend Integration

Інтегруй з UI через:

- WebSocket підключення до EventBus
- Local IPC
- UI підписка на `AgentStepEvent`, `ToolResultEvent`, `VFSChangeEvent`

### Type Safety

Розшир типи та контракти:

- JSON schemas для тулів
- Type-safe event envelopes
- Contract validation

## Приклад використання

Після запуску `npm run dev` ти побачиш:

```
🚀 Arium server running at http://localhost:4000
📡 WebSocket available at ws://localhost:4000
[EVENT] AgentStartEvent ...
[EVENT] AgentStepEvent ...
[EVENT] ModelResponseEvent ...
[EVENT] ToolInvocationEvent ...
[EVENT] ToolResultEvent ...
```

Всі події автоматично транслюються через WebSocket для UI в реальному часі!

## Наступні кроки

1. Заміни MockAdapter на реальний LLM adapter
2. Додай більше вбудованих інструментів
3. Реалізуй persistence для history та VFS
4. Додай sandboxing для безпеки
5. Інтегруй з UI Shell

---

**Приємної розробки! 🚀**

