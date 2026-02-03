# JavaScript Sandboxed Runner

**Version:** 1.0

Документація по використанню sandboxed JavaScript runner для безпечного виконання JS інструментів.

---

## Огляд

JS Runner виконує JavaScript код у безпечній ізольованій середовищі з використанням [VM2](https://github.com/patriksimek/vm2).

### Безпека

- ✅ Ізольоване виконання (не може отримати доступ до host process)
- ✅ Обмеження ресурсів (memory, CPU time)
- ✅ Timeout protection
- ✅ Обмежений доступ до файлової системи
- ✅ Контрольовані globals

---

## Використання

### Реєстрація JS Tool

```typescript
import { ToolEngine } from "./core/tool-engine";

const toolEngine = new ToolEngine(eventBus);

// Register JS tool with code string
toolEngine.register({
  id: "word-count",
  name: "Word Counter",
  description: "Counts words in text",
  runner: "js", // Important: specify "js" runner
  schema: {
    type: "object",
    properties: {
      text: { type: "string" }
    },
    required: ["text"]
  }
}, `
  export default async function run(args) {
    const words = args.text.trim().split(/\\s+/);
    return {
      ok: true,
      data: {
        count: words.length,
        words: words
      }
    };
  }
`);
```

### Приклад Tool Function

```javascript
// Tool must export a function
export default async function run(args) {
  // Access arguments
  const { input } = args;
  
  // Access safe globals
  const timestamp = Date.now();
  const result = Math.max(1, 2, 3);
  
  // Emit events (limited access)
  eventBus.emit("CustomEvent", { data: "value" });
  
  // Return result
  return {
    ok: true,
    data: {
      result: input.toUpperCase(),
      timestamp
    }
  };
}
```

---

## Доступні Globals

У sandbox доступні наступні безпечні globals:

### JavaScript Built-ins

- `console` - console logging
- `Date` - date/time operations
- `Math` - math functions
- `JSON` - JSON parsing
- `Buffer` - buffer operations

### Timers

- `setTimeout` / `clearTimeout`
- `setInterval` / `clearInterval`

### EventBus (Limited)

```javascript
eventBus.emit("EventType", { payload: "data" });
```

**Обмеження:** Можна лише emit події, не можна слухати або модифікувати.

---

## Обмеження

### Недоступне

- ❌ File system access (окрім через вбудовані інструменти)
- ❌ Network access
- ❌ Child process spawning
- ❌ `eval` / `Function` constructor
- ❌ WebAssembly
- ❌ Native modules
- ❌ `require` / `import` сторонніх модулів

### Resource Limits

- **Timeout**: 30 секунд (за замовчуванням)
- **Memory**: 256 MB (за замовчуванням)

---

## Налаштування

### Конфігурація Runner

```typescript
import { JSRunner } from "./core/tool-engine/runners/jsRunner";

const jsRunner = new JSRunner({
  timeout: 60000,        // 60 seconds
  memoryLimit: 512 * 1024 * 1024, // 512 MB
  sandbox: {
    // Додаткові globals
    MY_CUSTOM_CONSTANT: "value",
    myHelper: () => { /* ... */ }
  }
});

const toolEngine = new ToolEngine(eventBus);
toolEngine.jsRunner = jsRunner; // Set custom runner
```

---

## Формати Експорту

JS Runner підтримує кілька форматів експорту:

### ES6 Default Export (Рекомендовано)

```javascript
export default async function run(args) {
  return { ok: true, data: args };
}
```

### ES6 Named Export

```javascript
export async function run(args) {
  return { ok: true, data: args };
}
```

### CommonJS

```javascript
module.exports = async function(args) {
  return { ok: true, data: args };
};

// або

module.exports.default = async function(args) {
  return { ok: true, data: args };
};
```

---

## Обробка Помилок

```javascript
export default async function run(args) {
  try {
    // Tool logic
    return {
      ok: true,
      data: result
    };
  } catch (error) {
    return {
      ok: false,
      error: {
        message: error.message,
        code: "TOOL_ERROR"
      }
    };
  }
}
```

---

## Приклади

### Простий Calculator

```javascript
export default async function run(args) {
  const { operation, a, b } = args;
  
  let result;
  switch (operation) {
    case "add":
      result = a + b;
      break;
    case "multiply":
      result = a * b;
      break;
    default:
      return {
        ok: false,
        error: { message: "Unknown operation" }
      };
  }
  
  return {
    ok: true,
    data: { result }
  };
}
```

### Text Transformer

```javascript
export default async function run(args) {
  const { text, transform } = args;
  
  let result = text;
  switch (transform) {
    case "uppercase":
      result = text.toUpperCase();
      break;
    case "reverse":
      result = text.split("").reverse().join("");
      break;
    default:
      return {
        ok: false,
        error: { message: "Unknown transform" }
      };
  }
  
  return {
    ok: true,
    data: { original: text, transformed: result }
  };
}
```

### Data Validator

```javascript
export default async function run(args) {
  const { email } = args;
  
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const isValid = emailRegex.test(email);
  
  return {
    ok: true,
    data: {
      email,
      valid: isValid,
      message: isValid ? "Valid email" : "Invalid email"
    }
  };
}
```

---

## Best Practices

1. **Завжди перевіряй аргументи**
   ```javascript
   if (!args.requiredParam) {
     return { ok: false, error: { message: "Missing param" } };
   }
   ```

2. **Повертай стандартний формат**
   ```javascript
   return { ok: true, data: result };
   // або
   return { ok: false, error: { message: "..." } };
   ```

3. **Обробляй помилки**
   ```javascript
   try {
     // logic
   } catch (error) {
     return { ok: false, error: { message: error.message } };
   }
   ```

4. **Використовуй async/await**
   ```javascript
   export default async function run(args) {
     // async operations
   }
   ```

5. **Документуй schema**
   ```typescript
   schema: {
     type: "object",
     properties: {
       input: { type: "string", description: "Input text" }
     },
     required: ["input"]
   }
   ```

---

## Тестування

Для тестування JS tools локально:

```typescript
// test-tool.ts
const code = `
  export default async function run(args) {
    return { ok: true, data: args };
  }
`;

const runner = jsRunner.createRunner(code, eventBus);
const result = await runner({ test: "value" });
console.log(result); // { ok: true, data: { test: "value" } }
```

---

## Troubleshooting

### Timeout Error

Якщо tool виконується занадто довго:

```typescript
// Збільшити timeout
const jsRunner = new JSRunner({ timeout: 60000 }); // 60 seconds
```

### Memory Error

Якщо tool використовує занадто багато пам'яті:

```typescript
// Збільшити memory limit
const jsRunner = new JSRunner({
  memoryLimit: 512 * 1024 * 1024 // 512 MB
});
```

### Syntax Error

Переконайся що код валідний JavaScript:

```typescript
const validation = jsRunner.validate(code);
if (!validation.valid) {
  console.error("Invalid code:", validation.error);
}
```

---

## Майбутні Покращення

- [ ] Підтримка npm модулів (whitelist)
- [ ] Better error messages
- [ ] Performance profiling
- [ ] Code caching
- [ ] TypeScript support
- [ ] Hot reload для розробки

---

