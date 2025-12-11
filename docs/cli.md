# Arium CLI

**Version:** 0.1.0

Command-line interface for Arium AI IDE & Agent Platform.

---

## Installation

After installing Arium, the CLI is available via:

```bash
npm run cli
```

Or after building:

```bash
npm run build
./dist/cli/index.js
```

---

## Commands

### `arium serve`

Start the Arium server.

**Options:**
- `-p, --port <port>` - Server port (default: 4000)
- `--host <host>` - Server host (default: localhost)

**Example:**
```bash
arium serve -p 8080
```

**Environment Variables:**
- `OPENAI_API_KEY` - Use OpenAI adapter
- `USE_OLLAMA=true` - Use Ollama adapter
- `OLLAMA_URL` - Ollama server URL
- `PERSISTENT_STORAGE` - Enable disk persistence
- `WORKSPACE_PATH` - Workspace directory path

---

### `arium run <task>`

Run an agent task (coming soon).

**Example:**
```bash
arium run "Create a hello world file"
```

---

### `arium tools`

List all available tools.

**Example:**
```bash
arium tools
```

**Output:**
```
Available tools:
  - fs.read
  - fs.write
  - fs.delete
  - fs.list
  - vfs.diff
  - vfs.snapshot
  - system.hash
  - system.info
  - text.process
```

---

### `arium init [project-name]`

Initialize a new Arium project.

**Example:**
```bash
arium init my-project
```

Creates:
- Project directory
- `workspace/` folder
- `.env.example` file

---

### `arium version`

Show version information.

**Example:**
```bash
arium version
```

---

## Usage Examples

### Development Mode

```bash
# Start server with default settings
npm run cli serve

# Start on custom port
npm run cli serve -p 8080

# With OpenAI
OPENAI_API_KEY=sk-... npm run cli serve

# With Ollama
USE_OLLAMA=true OLLAMA_MODEL=llama2 npm run cli serve
```

### Initialize Project

```bash
# Create new project
arium init my-arium-project

cd my-arium-project

# Install dependencies (if needed)
npm install

# Configure .env
cp .env.example .env
# Edit .env with your settings

# Start server
npm run dev
```

---

## Configuration

The CLI respects all environment variables defined in `.env`:

- `OPENAI_API_KEY` - OpenAI API key
- `OPENAI_MODEL` - OpenAI model name
- `USE_OLLAMA` - Enable Ollama (true/false)
- `OLLAMA_URL` - Ollama server URL
- `OLLAMA_MODEL` - Ollama model name
- `PORT` - Server port
- `PERSISTENT_STORAGE` - Enable persistence (true/false)
- `WORKSPACE_PATH` - Workspace directory
- `PROJECT_ID` - Project identifier

---

## Integration

The CLI can be integrated into scripts:

```bash
#!/bin/bash
# start-arium.sh

export OPENAI_API_KEY=sk-...
export PORT=4000

npm run cli serve
```

---

## Troubleshooting

### Command not found

Make sure you've built the project:
```bash
npm run build
```

### Port already in use

Use a different port:
```bash
arium serve -p 8080
```

### Connection refused

Ensure the server is running and check the port configuration.

---

## Future Enhancements

- [ ] Interactive agent prompts
- [ ] Project management commands
- [ ] Tool registration via CLI
- [ ] Configuration wizard
- [ ] Log viewing and filtering
- [ ] Remote server management

