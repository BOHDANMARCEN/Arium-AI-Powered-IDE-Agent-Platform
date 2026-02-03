# Arium Server API Documentation

**Version:** 1.0

Ця документація описує REST API та WebSocket endpoints сервера Arium.

---

## Базовий URL

```
http://localhost:4000
```

---

## REST API Endpoints

### Agent Endpoints

#### `POST /agent/run`

Запускає агента з наданим завданням.

**Request Body:**
```json
{
  "input": "string - задача для агента"
}
```

**Response:**
```json
{
  "ok": true,
  "answer": "результат роботи агента"
}
```

**Example:**
```bash
curl -X POST http://localhost:4000/agent/run \
  -H "Content-Type: application/json" \
  -d '{"input": "Please read file src/main.ts (CALL: fs.read)"}'
```

---

### VFS Endpoints

#### `GET /vfs/list`

Отримує список всіх файлів у VFS.

**Response:**
```json
["src/main.ts", "test.txt", ...]
```

**Example:**
```bash
curl http://localhost:4000/vfs/list
```

---

#### `GET /vfs/read`

Читає вміст файлу з VFS.

**Query Parameters:**
- `path` (required) - шлях до файлу

**Response:**
```json
{
  "path": "src/main.ts",
  "content": "// file content here"
}
```

**Error Response (404):**
```json
{
  "error": "not found"
}
```

**Example:**
```bash
curl "http://localhost:4000/vfs/read?path=src/main.ts"
```

---

#### `POST /vfs/write`

Записує або оновлює файл у VFS.

**Request Body:**
```json
{
  "path": "string - шлях до файлу",
  "content": "string - вміст файлу"
}
```

**Response:**
```json
{
  "ok": true,
  "version": "version-id"
}
```

**Example:**
```bash
curl -X POST http://localhost:4000/vfs/write \
  -H "Content-Type: application/json" \
  -d '{"path": "test.txt", "content": "Hello, Arium!"}'
```

---

### Events Endpoints

#### `GET /events/history`

Отримує повну історію подій з EventBus.

**Response:**
```json
[
  {
    "id": "event-id",
    "type": "AgentStartEvent",
    "timestamp": 1234567890,
    "payload": { ... },
    "meta": { ... }
  },
  ...
]
```

**Example:**
```bash
curl http://localhost:4000/events/history
```

---

### Tools Endpoints

#### `GET /tools/list`

Отримує список зареєстрованих інструментів.

**Response:**
```json
[
  {
    "id": "fs.read",
    "name": "Read file",
    "description": "...",
    "runner": "builtin",
    "schema": { ... },
    "permissions": ["vfs.read"]
  },
  ...
]
```

**Example:**
```bash
curl http://localhost:4000/tools/list
```

---

#### `POST /tools/invoke`

Викликає інструмент з наданими аргументами.

**Request Body:**
```json
{
  "toolId": "string - ID інструменту",
  "args": {
    // аргументи згідно schema інструменту
  }
}
```

**Response:**
```json
{
  "ok": true,
  "data": { ... }
}
```

**Error Response:**
```json
{
  "ok": false,
  "error": {
    "message": "error message"
  }
}
```

**Example:**
```bash
curl -X POST http://localhost:4000/tools/invoke \
  -H "Content-Type: application/json" \
  -d '{
    "toolId": "fs.read",
    "args": {"path": "src/main.ts"}
  }'
```

---

## WebSocket API

### Підключення

```
ws://localhost:4000
```

### Повідомлення від сервера

#### `connected`

Надсилається одразу після підключення:

```json
{
  "type": "connected",
  "ts": 1234567890
}
```

#### `event`

Транслює всі події з EventBus в реальному часі:

```json
{
  "type": "event",
  "event": {
    "id": "event-id",
    "type": "AgentStartEvent",
    "timestamp": 1234567890,
    "payload": { ... },
    "meta": { ... }
  }
}
```

### Типи подій

- `AgentStartEvent` - агент почав виконання
- `AgentStepEvent` - крок виконання агента
- `AgentFinishEvent` - агент завершив виконання
- `ModelResponseEvent` - відповідь від моделі
- `ToolInvocationEvent` - виклик інструменту
- `ToolResultEvent` - результат виконання інструменту
- `VFSChangeEvent` - зміна у файловій системі
- `ToolErrorEvent` - помилка виконання інструменту
- `ModelErrorEvent` - помилка моделі
- `SecurityEvent` - подія безпеки

---

## Приклад WebSocket клієнта (JavaScript)

```javascript
const ws = new WebSocket('ws://localhost:4000');

ws.onopen = () => {
  console.log('Connected to Arium server');
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  
  if (data.type === 'connected') {
    console.log('Server connected at:', new Date(data.ts));
  } else if (data.type === 'event') {
    console.log('Event received:', data.event.type, data.event.payload);
  }
};

ws.onerror = (error) => {
  console.error('WebSocket error:', error);
};

ws.onclose = () => {
  console.log('Disconnected from Arium server');
};
```

---

## Error Handling

Всі API endpoints повертають стандартні HTTP статус коди:

- `200 OK` - успішний запит
- `400 Bad Request` - невалідні параметри
- `404 Not Found` - ресурс не знайдено
- `500 Internal Server Error` - внутрішня помилка сервера

Помилки повертаються у форматі:

```json
{
  "error": "опис помилки"
}
```

---

## Розширення

Сервер розроблений з урахуванням можливості розширення:

- Додавання нових маршрутів у `src/server/routes/`
- Налаштування middleware у `src/server/http.ts`
- Розширення WebSocket логіки у `src/server/websocket.ts`
- Інтеграція з authentication/authorization
- Rate limiting та безпека
- Підтримка кластерного режиму

---

