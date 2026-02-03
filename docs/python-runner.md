# Python Sandboxed Runner

**Version:** 1.0

Документація по використанню sandboxed Python runner для безпечного виконання Python інструментів.

---

## Огляд

Python Runner виконує Python код у ізольованому subprocess з обмеженнями ресурсів.

### Безпека

- ✅ Subprocess isolation (окремий процес)
- ✅ Обмеження ресурсів (timeout, memory)
- ✅ Timeout protection (автоматичне завершення)
- ✅ JSON-based communication (безпековий обмін даними)

---

## Передумови

### Встановлення Python

Python runner потребує Python 3.7+ на системі:

**Linux/macOS:**
```bash
python3 --version  # Перевірка версії
```

**Windows:**
```bash
python --version
```

Переконайся що Python доступний у PATH.

---

## Використання

### Реєстрація Python Tool

```typescript
import { ToolEngine } from "./core/tool-engine";

const toolEngine = new ToolEngine(eventBus);

// Register Python tool with code string
toolEngine.register({
  id: "text-processor",
  name: "Text Processor",
  description: "Processes text using Python",
  runner: "py", // Important: specify "py" runner
  schema: {
    type: "object",
    properties: {
      text: { type: "string" }
    },
    required: ["text"]
  }
}, `
def run(args):
    text = args.get("text", "")
    words = text.split()
    return {
        "ok": True,
        "data": {
            "wordCount": len(words)
        }
    }
`);
```

### Приклад Tool Function

```python
def run(args):
    """
    Tool function that processes arguments and returns result
    
    Args:
        args: Dictionary with tool arguments
        
    Returns:
        Dictionary with 'ok' (bool) and 'data' or 'error' fields
    """
    # Access arguments
    text = args.get("text", "")
    
    if not text:
        return {
            "ok": False,
            "error": {"message": "Missing parameter: text"}
        }
    
    # Process data
    words = text.strip().split()
    
    # Return result
    return {
        "ok": True,
        "data": {
            "wordCount": len(words),
            "words": words
        }
    }
```

---

## Формат Відповіді

Tool функція повинна повертати dictionary у форматі:

```python
{
    "ok": True,           # bool - успіх чи ні
    "data": { ... }       # дані результату (якщо ok=True)
}

# або при помилці:

{
    "ok": False,
    "error": {            # помилка (якщо ok=False)
        "message": "...",
        "type": "ErrorType"
    }
}
```

Якщо функція повертає інший формат, він автоматично обгортається:

```python
return "some value"
# стає:
# {"ok": True, "data": "some value"}
```

---

## Обмеження

### Resource Limits

- **Timeout**: 30 секунд (за замовчуванням)
- **Memory**: 256 MB (за замовчуванням)
- **Process isolation**: Кожен виклик у окремому процесі

### Доступ

- ✅ Стандартна бібліотека Python
- ✅ JSON ввід/вивід
- ❌ Файлова система (окрім тимчасових файлів)
- ❌ Мережа
- ❌ Сторонні модулі (окрім вбудованих у Python)

---

## Налаштування

### Конфігурація Runner

```typescript
import { PyRunner } from "./core/tool-engine/runners/pyRunner";

const pyRunner = new PyRunner({
  pythonPath: "python3",      // Шлях до Python
  timeout: 60000,              // 60 секунд
  maxMemoryMB: 512,            // 512 MB
  workingDir: "/tmp/arium-py"  // Робоча директорія
});

const toolEngine = new ToolEngine(eventBus);
toolEngine.pyRunner = pyRunner; // Set custom runner
```

### Environment Variables

```env
PYTHON_PATH=python3
PYTHON_TIMEOUT_MS=30000
PYTHON_MAX_MEMORY_MB=256
```

---

## Обробка Помилок

```python
def run(args):
    try:
        # Tool logic
        result = process_data(args)
        return {
            "ok": True,
            "data": result
        }
    except ValueError as e:
        return {
            "ok": False,
            "error": {
                "message": str(e),
                "type": "ValueError"
            }
        }
    except Exception as e:
        return {
            "ok": False,
            "error": {
                "message": f"Unexpected error: {str(e)}",
                "type": type(e).__name__
            }
        }
```

---

## Приклади

### Text Analyzer

```python
def run(args):
    text = args.get("text", "")
    
    return {
        "ok": True,
        "data": {
            "length": len(text),
            "wordCount": len(text.split()),
            "charCount": len(text.replace(" ", "")),
            "uppercase": text.upper(),
            "lowercase": text.lower()
        }
    }
```

### List Processor

```python
def run(args):
    items = args.get("items", [])
    operation = args.get("operation", "sum")
    
    if operation == "sum":
        result = sum(items)
    elif operation == "max":
        result = max(items)
    elif operation == "min":
        result = min(items)
    else:
        return {
            "ok": False,
            "error": {"message": f"Unknown operation: {operation}"}
        }
    
    return {
        "ok": True,
        "data": {"result": result}
    }
```

### Data Validator

```python
import re

def run(args):
    email = args.get("email", "")
    
    pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    is_valid = bool(re.match(pattern, email))
    
    return {
        "ok": True,
        "data": {
            "email": email,
            "valid": is_valid,
            "message": "Valid email" if is_valid else "Invalid email"
        }
    }
```

### Mathematical Operations

```python
import math

def run(args):
    operation = args.get("operation")
    a = args.get("a", 0)
    b = args.get("b", 0)
    
    operations = {
        "add": lambda x, y: x + y,
        "multiply": lambda x, y: x * y,
        "power": lambda x, y: x ** y,
        "sqrt": lambda x, y: math.sqrt(x),
    }
    
    if operation not in operations:
        return {
            "ok": False,
            "error": {"message": f"Unknown operation: {operation}"}
        }
    
    result = operations[operation](a, b)
    
    return {
        "ok": True,
        "data": {"result": result}
    }
```

---

## Best Practices

1. **Завжди перевіряй аргументи**
   ```python
   if "required_param" not in args:
       return {"ok": False, "error": {"message": "Missing param"}}
   ```

2. **Повертай стандартний формат**
   ```python
   return {"ok": True, "data": result}
   # або
   return {"ok": False, "error": {"message": "..."}}
   ```

3. **Обробляй помилки**
   ```python
   try:
       # logic
   except Exception as e:
       return {"ok": False, "error": {"message": str(e)}}
   ```

4. **Використовуй type hints (опціонально)**
   ```python
   def run(args: dict) -> dict:
       ...
   ```

5. **Документуй функцію**
   ```python
   def run(args):
       """Process text and return statistics"""
       ...
   ```

---

## Troubleshooting

### Python Not Found

Якщо отримуєш помилку "Failed to spawn Python process":

```typescript
// Вкажи правильний шлях до Python
const pyRunner = new PyRunner({
  pythonPath: "/usr/bin/python3" // або "C:\\Python39\\python.exe" на Windows
});
```

### Timeout Error

Якщо tool виконується занадто довго:

```typescript
// Збільшити timeout
const pyRunner = new PyRunner({ timeout: 60000 }); // 60 seconds
```

### Memory Error

Якщо tool використовує занадто багато пам'яті:

```typescript
// Збільшити memory limit (обмеження через OS)
const pyRunner = new PyRunner({
  maxMemoryMB: 512
});
```

### Import Error

Python runner підтримує тільки стандартну бібліотеку:

```python
# ✅ Працює
import json
import re
import math

# ❌ Не працює
import requests
import numpy
```

---

## Відмінності від JS Runner

| Функція | JS Runner | Python Runner |
|---------|-----------|---------------|
| Ізоляція | VM2 sandbox | Subprocess |
| Швидкість | Швидший (in-process) | Повільніший (spawn) |
| Безпека | VM2 protection | Process isolation |
| Модулі | Обмежені globals | Стандартна бібліотека Python |
| Memory | Shared with process | Isolated per execution |

---

## Майбутні Покращення

- [ ] Docker-based isolation
- [ ] Virtualenv support
- [ ] Package whitelist
- [ ] Better error messages
- [ ] Performance profiling
- [ ] Code caching
- [ ] Type checking with mypy

---

