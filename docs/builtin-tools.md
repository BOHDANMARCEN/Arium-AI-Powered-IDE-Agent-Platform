# Built-in Tools

**Version:** 1.0

Документація по всіх вбудованих інструментах Arium.

---

## Огляд

Arium включає набір вбудованих інструментів для роботи з файловою системою та системними операціями.

---

## File System Tools

### `fs.read`

Читає файл з VFS.

**Schema:**
```json
{
  "path": "string" // required
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

**Response:**
```json
{
  "ok": true,
  "data": "// file content..."
}
```

---

### `fs.write`

Записує або оновлює файл у VFS.

**Schema:**
```json
{
  "path": "string",     // required
  "content": "string"   // required
}
```

**Example:**
```bash
curl -X POST http://localhost:4000/tools/invoke \
  -H "Content-Type: application/json" \
  -d '{
    "toolId": "fs.write",
    "args": {
      "path": "test.txt",
      "content": "Hello, Arium!"
    }
  }'
```

**Response:**
```json
{
  "ok": true,
  "data": {
    "versionId": "ver-...",
    "path": "test.txt"
  }
}
```

---

### `fs.delete`

Видаляє файл з VFS.

**Schema:**
```json
{
  "path": "string" // required
}
```

**Example:**
```bash
curl -X POST http://localhost:4000/tools/invoke \
  -H "Content-Type: application/json" \
  -d '{
    "toolId": "fs.delete",
    "args": {"path": "test.txt"}
  }'
```

**Response:**
```json
{
  "ok": true,
  "data": {
    "path": "test.txt"
  }
}
```

---

### `fs.list`

Повертає список всіх файлів у VFS.

**Schema:**
```json
{
  "path": "string" // optional (not yet implemented)
}
```

**Example:**
```bash
curl -X POST http://localhost:4000/tools/invoke \
  -H "Content-Type: application/json" \
  -d '{
    "toolId": "fs.list",
    "args": {}
  }'
```

**Response:**
```json
{
  "ok": true,
  "data": {
    "files": ["src/main.ts", "README.md"],
    "count": 2
  }
}
```

---

## VFS Tools

### `vfs.diff`

Обчислює різницю між двома версіями файлів.

**Schema:**
```json
{
  "versionA": "string", // required
  "versionB": "string"  // required
}
```

**Example:**
```bash
curl -X POST http://localhost:4000/tools/invoke \
  -H "Content-Type: application/json" \
  -d '{
    "toolId": "vfs.diff",
    "args": {
      "versionA": "ver-001",
      "versionB": "ver-002"
    }
  }'
```

---

### `vfs.snapshot`

Створює знімок поточного стану VFS.

**Schema:**
```json
{
  "label": "string" // optional
}
```

**Example:**
```bash
curl -X POST http://localhost:4000/tools/invoke \
  -H "Content-Type: application/json" \
  -d '{
    "toolId": "vfs.snapshot",
    "args": {
      "label": "before-refactoring"
    }
  }'
```

**Response:**
```json
{
  "ok": true,
  "data": {
    "snapshotId": "snap-...",
    "label": "before-refactoring"
  }
}
```

---

## System Tools

### `system.hash`

Обчислює hash тексту або файлу.

**Schema:**
```json
{
  "input": "string",           // required - text or file path
  "type": "text" | "file"      // optional - default: "text"
}
```

**Example (text):**
```bash
curl -X POST http://localhost:4000/tools/invoke \
  -H "Content-Type: application/json" \
  -d '{
    "toolId": "system.hash",
    "args": {
      "input": "Hello, World!",
      "type": "text"
    }
  }'
```

**Example (file):**
```bash
curl -X POST http://localhost:4000/tools/invoke \
  -H "Content-Type: application/json" \
  -d '{
    "toolId": "system.hash",
    "args": {
      "input": "src/main.ts",
      "type": "file"
    }
  }'
```

**Response:**
```json
{
  "ok": true,
  "data": {
    "hash": "a1b2c3d4...",
    "input": "Hello, World!"
  }
}
```

---

### `system.info`

Повертає інформацію про систему.

**Schema:**
```json
{}
```

**Example:**
```bash
curl -X POST http://localhost:4000/tools/invoke \
  -H "Content-Type: application/json" \
  -d '{
    "toolId": "system.info",
    "args": {}
  }'
```

**Response:**
```json
{
  "ok": true,
  "data": {
    "platform": "linux",
    "nodeVersion": "v18.0.0",
    "uptime": 1234.56,
    "memory": {
      "used": 128,
      "total": 256
    }
  }
}
```

---

## Text Tools

### `text.process`

Базові операції обробки тексту.

**Schema:**
```json
{
  "text": "string",                    // required
  "operation": "uppercase" | "lowercase" | "reverse" | "trim" | "word-count"
}
```

**Operations:**
- `uppercase` - перетворити у верхній регістр
- `lowercase` - перетворити у нижній регістр
- `reverse` - реверсувати текст
- `trim` - обрізати пробіли
- `word-count` - порахувати слова

**Example:**
```bash
curl -X POST http://localhost:4000/tools/invoke \
  -H "Content-Type: application/json" \
  -d '{
    "toolId": "text.process",
    "args": {
      "text": "Hello, World!",
      "operation": "uppercase"
    }
  }'
```

**Response:**
```json
{
  "ok": true,
  "data": {
    "result": "HELLO, WORLD!",
    "operation": "uppercase"
  }
}
```

---

## Custom Tools

Окрім вбудованих, можна реєструвати власні інструменти:

### JavaScript Tools

```typescript
toolEngine.register({
  id: "my-custom-tool",
  name: "My Custom Tool",
  runner: "js",
  schema: { ... }
}, `
  export default async function run(args) {
    return { ok: true, data: "result" };
  }
`);
```

### Python Tools

```typescript
toolEngine.register({
  id: "my-python-tool",
  name: "My Python Tool",
  runner: "py",
  schema: { ... }
}, `
def run(args):
    return {"ok": True, "data": "result"}
`);
```

---

## Permissions

Кожен інструмент має список permissions:

- `vfs.read` - читання з VFS
- `vfs.write` - запис у VFS
- `vfs.delete` - видалення з VFS
- (пустий список = без дозволів)

---

## Error Handling

Всі інструменти повертають стандартний формат:

**Success:**
```json
{
  "ok": true,
  "data": { ... }
}
```

**Error:**
```json
{
  "ok": false,
  "error": {
    "message": "Error description",
    "code": "ERROR_CODE"
  }
}
```

---

## Майбутні Інструменти

- [ ] `git.status` - Git operations
- [ ] `http.request` - HTTP requests
- [ ] `file.search` - Пошук у файлах
- [ ] `code.format` - Форматування коду
- [ ] `test.run` - Запуск тестів
- [ ] `package.install` - Package management

---

