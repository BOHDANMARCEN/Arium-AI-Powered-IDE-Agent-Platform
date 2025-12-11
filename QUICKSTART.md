# Arium Quick Start Guide

**Version:** 0.1.0

Quick guide to get started with Arium AI IDE & Agent Platform.

---

## Prerequisites

- **Node.js** 18+ ([download](https://nodejs.org/))
- **npm** or **pnpm**
- **Python 3.10+** (optional, for Python runner)
- **Ollama** (optional, for local models)

---

## Installation

### 1. Clone Repository

```bash
git clone https://github.com/BOHDANMARCEN/Arium-AI-Powered-IDE-Agent-Platform.git
cd Arium-AI-Powered-IDE-Agent-Platform
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment

Copy the example environment file:

```bash
cp .env.example .env
```

Edit `.env` with your settings:

```env
# For OpenAI (optional)
OPENAI_API_KEY=sk-xxxx

# For Ollama (optional)
USE_OLLAMA=true
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=llama2

# Server
PORT=4000

# Storage
PERSISTENT_STORAGE=true
WORKSPACE_PATH=./workspace
PROJECT_ID=default
```

---

## Running Arium

### Option 1: Development Mode (Recommended)

```bash
npm run dev
```

This starts the server with hot-reload.

### Option 2: Using CLI

```bash
npm run cli serve
```

### Option 3: Production Build

```bash
npm run build
npm start
```

---

## Quick Test

### 1. Start Server

```bash
npm run dev
```

You should see:
```
🚀 Arium server running at http://localhost:4000
```

### 2. Test API

```bash
# List tools
curl http://localhost:4000/tools/list

# List files
curl http://localhost:4000/vfs/list

# Run agent (example)
curl -X POST http://localhost:4000/agent/run \
  -H "Content-Type: application/json" \
  -d '{"input": "Create a hello world file"}'
```

---

## Using the UI Shell

### 1. Start Backend

```bash
npm run dev
```

### 2. Start UI (in another terminal)

```bash
cd app
npm install
npm start
```

The UI will open at `http://localhost:3000` and connect to the backend.

---

## Using Ollama (Local Models)

### 1. Install Ollama

**macOS/Linux:**
```bash
curl -fsSL https://ollama.ai/install.sh | sh
```

**Windows:** Download from [ollama.ai](https://ollama.ai/download)

### 2. Start Ollama

```bash
ollama serve
```

### 3. Download Model

```bash
ollama pull llama2
```

### 4. Configure Arium

In `.env`:
```env
USE_OLLAMA=true
OLLAMA_MODEL=llama2
```

### 5. Start Arium

```bash
npm run dev
```

---

## CLI Commands

### Start Server

```bash
npm run cli serve -p 4000
```

### List Tools

```bash
npm run cli tools
```

### Initialize Project

```bash
npm run cli init my-project
```

### Show Version

```bash
npm run cli version
```

---

## Project Structure

```
arium/
├── src/              # Core implementation
│   ├── core/         # Core engines
│   ├── server/       # API server
│   └── cli/          # CLI interface
├── app/              # UI Shell (React)
├── docs/             # Documentation
└── workspace/        # Project workspace (auto-created)
```

---

## Next Steps

1. **Read Documentation:**
   - [Architecture](./docs/architecture.md)
   - [API Documentation](./docs/server-api.md)
   - [Tool Engine](./docs/tool-engine.md)

2. **Try Examples:**
   - Create custom tools
   - Run agent tasks
   - Explore the UI

3. **Extend:**
   - Add custom model adapters
   - Create new tools
   - Build plugins

---

## Troubleshooting

### Port Already in Use

```bash
# Use different port
PORT=8080 npm run dev
```

### Ollama Not Found

```bash
# Check if Ollama is running
curl http://localhost:11434/api/tags

# Start Ollama
ollama serve
```

### Python Runner Not Working

Ensure Python 3.10+ is installed:
```bash
python3 --version
```

### Build Errors

```bash
# Clean and rebuild
rm -rf dist node_modules
npm install
npm run build
```

---

## Getting Help

- **GitHub Issues**: [Report problems](https://github.com/BOHDANMARCEN/Arium-AI-Powered-IDE-Agent-Platform/issues)
- **Documentation**: See `docs/` folder
- **Examples**: Check code examples in source

---

## License

Apache-2.0

---

Happy coding with Arium! 🚀
