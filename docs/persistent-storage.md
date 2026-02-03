# Persistent Storage

**Version:** 1.0

Документація по persistent storage в Arium — збереження подій та файлів на диск.

---

## Огляд

Persistent storage забезпечує:

- **EventBus History** — append-only лог всіх подій у `workspace/<project>/history.log`
- **VFS Files** — файли зберігаються на диск у `workspace/<project>/files/`
- **Versions** — метадані версій файлів у `workspace/<project>/versions/`
- **Snapshots** — знімки стану у `workspace/<project>/snapshots/`

---

## Конфігурація

### Environment Variables

Додай у `.env`:

```env
WORKSPACE_PATH=./workspace
PROJECT_ID=default
PERSISTENT_STORAGE=true
```

- `WORKSPACE_PATH` — базовий шлях до workspace (за замовчуванням: `./workspace`)
- `PROJECT_ID` — ідентифікатор проєкту (за замовчуванням: `default`)
- `PERSISTENT_STORAGE` — увімкнути/вимкнути persistent storage (за замовчуванням: `true`)

### Вимкнення Persistent Storage

Для використання in-memory storage (для тестування):

```env
PERSISTENT_STORAGE=false
```

---

## Структура Workspace

```
workspace/
└── <projectId>/
    ├── history.log          # Append-only лог подій
    ├── files/               # Файли проєкту
    │   ├── src/
    │   │   └── main.ts
    │   └── README.md
    ├── versions/            # Метадані версій файлів
    │   ├── ver-001.json
    │   └── ver-002.json
    └── snapshots/           # Знімки стану
        ├── snap-001.json
        └── snap-002.json
```

---

## EventBus History

### Формат

Кожна подія записується як один рядок JSON у `history.log`:

```json
{"id":"01HX...","type":"AgentStartEvent","timestamp":1234567890,"payload":{...}}
{"id":"01HY...","type":"ModelResponseEvent","timestamp":1234567891,"payload":{...}}
```

### Переваги

- **Append-only** — події ніколи не змінюються або не видаляються
- **Аудит** — повна історія всіх дій
- **Відтворюваність** — можна відтворити будь-який стан системи
- **Відлагодження** — легкий аналіз проблем

### Завантаження

При старті системи history автоматично завантажується з диску.

---

## VFS Files

### Збереження файлів

Файли автоматично зберігаються на диск при:

- `vfs.write()` — запис/оновлення файлу
- Створенні нової версії

### Завантаження

При ініціалізації `PersistentVFS`:

1. Сканує директорію `files/`
2. Завантажує всі файли в пам'ять
3. Створює версії для кожного файлу

### Безпека шляхів

Шляхи автоматично санітизуються:

- Видаляються `..` послідовності
- Нормалізуються path separators
- Перевіряються на безпеку

---

## Versions

Кожна версія файлу зберігається окремо:

```json
{
  "id": "ver-001",
  "content": "// file content",
  "timestamp": 1234567890,
  "author": "agent",
  "hash": "abc123",
  "prev": "ver-000"
}
```

Це дозволяє:

- Відстежувати історію змін
- Відновлювати попередні версії
- Обчислювати diff між версіями

---

## Snapshots

Snapshots зберігають повний стан файлової системи:

```json
{
  "src/main.ts": "// content",
  "README.md": "# Project"
}
```

Створюються при:

- Завершенні роботи агента
- Ручному виклику `vfs.snapshot()`
- Важливих мілстоунах

---

## Програмне використання

### Ініціалізація

```typescript
import { PersistentEventBus, PersistentVFS } from "./core/storage";

// EventBus
const eventBus = await new PersistentEventBus({
  workspacePath: "./workspace",
  projectId: "my-project",
}).initialize();

// VFS
const vfs = await new PersistentVFS(eventBus, {
  workspacePath: "./workspace",
  projectId: "my-project",
}).initialize();
```

### Завершення роботи

```typescript
// Close event bus log stream
if (eventBus instanceof PersistentEventBus) {
  await eventBus.close();
}
```

---

## Міграція з In-Memory

Якщо ти вже використовував in-memory storage:

1. Увімкни persistent storage у `.env`
2. Перезапусти сервер
3. Дані автоматично збережуться на диск

Зворотна міграція (persistent → in-memory) потребує ручного копіювання файлів.

---

## Відновлення після збою

При збої системи:

1. При наступному старті history автоматично завантажиться
2. Всі файли відновляться з `files/`
3. Версії та snapshots доступні для аналізу

---

## Оптимізація

### Ротація логів

Для великих проєктів можна додати ротацію логів:

```typescript
// Rotate log file when it exceeds size
if (logSize > MAX_LOG_SIZE) {
  await rotateLog();
}
```

### Стиснення старих версій

Старовинні версії можна стискати або архівувати.

### Очищення snapshots

Регулярно видаляй старі snapshots, щоб зберегти місце.

---

## Обмеження

- **Performance**: Запис на диск може бути повільнішим за in-memory
- **Disk Space**: History та версії потребують місця на диску
- **Concurrent Access**: Зараз не підтримується одночасний доступ з кількох процесів

---

## Майбутні покращення

- [ ] Ротація та стиснення логів
- [ ] Кешування для швидшого доступу
- [ ] Підтримка бази даних (SQLite, PostgreSQL)
- [ ] Replication для відмовостійкості
- [ ] Encryption для чутливих даних

---

