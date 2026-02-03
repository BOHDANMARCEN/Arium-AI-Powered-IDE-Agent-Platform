# Gradio VSCode UI

This optional UI provides a VSCode-like interface for the running Arium API.

## Requirements

- Python 3.10+
- Arium API running (default `http://localhost:3000`)

## Install

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r ui/gradio/requirements.txt
```

## Run

```bash
python ui/gradio/app.py
```

The UI starts on `http://localhost:7860` by default.

## Configuration

- `ARIUM_API_URL` - API base URL (default: `http://localhost:4000`)
- `ARIUM_TIMEOUT` - request timeout in seconds (default: `30`)
- `OLLAMA_HOST` - Ollama HTTP host (default: `http://localhost:11434`)
- `GRADIO_PORT` - UI port (default: `7860`)
- `GRADIO_SERVER_NAME` - bind host (default: `127.0.0.1`)

Use the URL printed by Gradio (typically `http://127.0.0.1:7860`). The
`0.0.0.0` address is only a bind address and is not directly browseable.

The WebSocket panel supports the `token` query parameter. If your server
requires WebSocket auth (`WS_REQUIRE_AUTH=true`), provide a JWT token in the
Settings panel.

To disable WebSocket auth locally, start the server with `WS_REQUIRE_AUTH=false`.

## Notes

- Provider/model selection is UI-side. The server adapter is still controlled
  by environment variables when Arium starts.
- Ollama models are auto-discovered from `/api/tags` and cached for 30s.
- Default model in the UI is `gemma-3-abliterated:latest`.

If the API URL omits a port (e.g., `http://localhost`), the UI will reuse the
port from `ARIUM_API_URL` (default `3000`).

## Panels

- Chat: run `/agent/run` and view streamed events.
- Tools: list and invoke `/tools` endpoints.
- VFS: list, read, write, delete `/vfs` entries.
- Events: live WebSocket stream with history fallback.
- Settings: API, provider/model, and WebSocket options.
