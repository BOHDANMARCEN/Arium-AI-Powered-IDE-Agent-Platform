import json
import os
import threading
import time
from collections import deque
from typing import Any, Dict, List, Optional, Tuple
import socket
from urllib.parse import urlencode, urlsplit, urlunsplit

import gradio as gr
import requests


def get_int_env(name: str, fallback: int) -> int:
    value = os.environ.get(name)
    if value is None:
        return fallback
    try:
        return int(value)
    except ValueError:
        return fallback


def find_available_port(start_port: int, attempts: int = 10) -> int:
    port = start_port
    for _ in range(attempts):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            if sock.connect_ex(("127.0.0.1", port)) != 0:
                return port
        port += 1
    return start_port


DEFAULT_API_BASE = os.environ.get("ARIUM_API_URL", "http://localhost:4000").rstrip("/")
DEFAULT_OLLAMA_HOST = os.environ.get("OLLAMA_HOST", "http://localhost:11434").rstrip(
    "/"
)
DEFAULT_MODEL = "gemma-3-abliterated:latest"
DEFAULT_PROVIDER = "ollama"
DEFAULT_TIMEOUT = get_int_env("ARIUM_TIMEOUT", 30)
DEFAULT_EVENT_LIMIT = 200
DEFAULT_SERVER_NAME = os.environ.get("GRADIO_SERVER_NAME", "127.0.0.1")

PROVIDERS = ["ollama", "openai", "mock"]
OPENAI_MODELS = ["gpt-4o-mini", "gpt-4o"]
MOCK_MODELS = ["mock"]
PREFERRED_OLLAMA_MODELS = [
    "gemini-3-flash-preview:cloud",
    "kimi-k2-thinking:cloud",
    "gpt-oss:120b-cloud",
    "huihui_ai/qwen3-abliterated:14b",
    "deepseek-v3.1:671b-cloud",
    "qwen3-coder:480b-cloud",
    "huihui_ai/qwen2.5-1m-abliterated:14b",
    "llama3.2:3b",
    "gpt-oss-20b-quality:latest",
    "gemma-3-abliterated:latest",
    "gemma-abliterated:latest",
]


def normalize_api_base(value: str) -> str:
    raw = (value or "").strip()
    if not raw:
        return DEFAULT_API_BASE

    if "://" not in raw:
        raw = f"http://{raw}"

    parts = urlsplit(raw)
    if not parts.netloc:
        return DEFAULT_API_BASE

    # Handle missing port like http://localhost:
    if parts.netloc.endswith(":") and not parts.port:
        return DEFAULT_API_BASE

    if ":" not in parts.netloc:
        default_parts = urlsplit(DEFAULT_API_BASE)
        if default_parts.port:
            netloc = f"{parts.hostname}:{default_parts.port}"
            raw = urlunsplit(
                (parts.scheme, netloc, parts.path, parts.query, parts.fragment)
            )

    return raw.rstrip("/")


def parse_allowlist(value: Optional[str]) -> List[str]:
    if not value:
        return []
    return [item.strip() for item in value.split(",") if item.strip()]


def safe_json(data: Any) -> str:
    try:
        return json.dumps(data, indent=2, ensure_ascii=True)
    except TypeError:
        return json.dumps(str(data), indent=2, ensure_ascii=True)


def as_chat_messages(history: Any) -> List[Dict[str, str]]:
    """Normalize Chatbot history to Gradio 'messages' format.

    Gradio 6 Chatbot expects messages as list of dicts with {role, content}.
    We also accept legacy tuple format [(user, assistant), ...] for safety.
    """

    if not history:
        return []

    if isinstance(history, list) and history:
        first = history[0]
        if isinstance(first, dict) and "role" in first and "content" in first:
            out: List[Dict[str, str]] = []
            for item in history:
                if not isinstance(item, dict):
                    continue
                role = item.get("role")
                content = item.get("content")
                if isinstance(role, str) and isinstance(content, str):
                    out.append({"role": role, "content": content})
            return out

        # Legacy: list of (user, assistant)
        out = []
        for pair in history:
            if not isinstance(pair, (list, tuple)) or len(pair) != 2:
                continue
            user, assistant = pair
            if isinstance(user, str):
                out.append({"role": "user", "content": user})
            if isinstance(assistant, str):
                out.append({"role": "assistant", "content": assistant})
        return out

    return []


class ApiClient:
    def __init__(self, base_url: str, timeout: int, token: str = ""):
        self.base_url = normalize_api_base(base_url)
        self.timeout = max(1, int(timeout))
        self.session = requests.Session()
        self.token = token

    def _headers(self) -> Dict[str, str]:
        headers = {"Content-Type": "application/json"}
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        return headers

    def request(
        self,
        method: str,
        path: str,
        payload: Optional[Dict[str, Any]] = None,
        params: Optional[Dict[str, Any]] = None,
    ) -> Tuple[Dict[str, Any], float]:
        url = f"{self.base_url}{path}"
        start = time.time()
        try:
            response = self.session.request(
                method,
                url,
                json=payload,
                params=params,
                timeout=self.timeout,
                headers=self._headers(),
            )
        except requests.RequestException as exc:
            return {"ok": False, "error": str(exc)}, time.time() - start

        latency = time.time() - start
        try:
            data = response.json()
        except ValueError:
            data = {"raw": response.text}

        if response.status_code >= 400:
            return {
                "ok": False,
                "status": response.status_code,
                "error": data,
            }, latency

        return {"ok": True, "status": response.status_code, "data": data}, latency

    def health(self) -> Tuple[Dict[str, Any], float]:
        return self.request("GET", "/health")

    def root(self) -> Tuple[Dict[str, Any], float]:
        return self.request("GET", "/")

    def agent_run(self, input_text: str) -> Tuple[Dict[str, Any], float]:
        return self.request("POST", "/agent/run", {"input": input_text})

    def tools_list(self) -> Tuple[Dict[str, Any], float]:
        return self.request("GET", "/tools/list")

    def tools_invoke(
        self,
        tool_id: str,
        args: Dict[str, Any],
        permissions: Optional[List[str]] = None,
    ) -> Tuple[Dict[str, Any], float]:
        payload: Dict[str, Any] = {"toolId": tool_id, "args": args}
        if permissions:
            payload["permissions"] = permissions
        return self.request("POST", "/tools/invoke", payload)

    def vfs_list(self) -> Tuple[Dict[str, Any], float]:
        return self.request("GET", "/vfs/list")

    def vfs_read(self, path: str) -> Tuple[Dict[str, Any], float]:
        return self.request("GET", "/vfs/read", params={"path": path})

    def vfs_write(self, path: str, content: str) -> Tuple[Dict[str, Any], float]:
        return self.request("POST", "/vfs/write", {"path": path, "content": content})

    def vfs_delete(self, path: str) -> Tuple[Dict[str, Any], float]:
        return self.request("DELETE", "/vfs/delete", params={"path": path})

    def events_history(self) -> Tuple[Dict[str, Any], float]:
        return self.request("GET", "/events/history")


class OllamaModelCache:
    def __init__(self, ttl_seconds: int = 30):
        self.ttl_seconds = ttl_seconds
        self.cache: List[str] = []
        self.expires_at = 0.0
        self.lock = threading.Lock()

    def list_models(
        self,
        host: str,
        allowlist: Optional[List[str]] = None,
        refresh: bool = False,
    ) -> List[str]:
        now = time.time()
        with self.lock:
            if not refresh and self.cache and now < self.expires_at:
                return list(self.cache)

        models = fetch_ollama_models(host)
        if allowlist:
            allow_set = set(allowlist)
            models = [model for model in models if model in allow_set]

        include_default = not allowlist or DEFAULT_MODEL in allowlist
        if include_default and DEFAULT_MODEL not in models:
            models = [DEFAULT_MODEL] + models

        if not models:
            models = [DEFAULT_MODEL]

        with self.lock:
            self.cache = list(models)
            self.expires_at = now + self.ttl_seconds
        return list(models)


def fetch_ollama_models(host: str) -> List[str]:
    try:
        response = requests.get(f"{host.rstrip('/')}/api/tags", timeout=5)
        response.raise_for_status()
        payload = response.json()
    except requests.RequestException:
        return []
    except ValueError:
        return []

    models = []
    for item in payload.get("models", []) if isinstance(payload, dict) else []:
        name = item.get("name") or item.get("model")
        if isinstance(name, str) and name:
            models.append(name)

    seen = set()
    deduped = []
    for model in models:
        if model not in seen:
            seen.add(model)
            deduped.append(model)
    return deduped


class EventStream:
    def __init__(self, max_events: int = 500):
        self.max_events = max_events
        self.buffer: deque = deque(maxlen=max_events)
        self.lock = threading.Lock()
        self.thread: Optional[threading.Thread] = None
        self.stop_event = threading.Event()
        self.connected = False
        self.last_error = ""
        self.ws_url = ""
        self.token = ""

    def start(self, ws_url: str, token: str) -> str:
        if self.thread and self.thread.is_alive():
            return "Event stream already running"
        self.ws_url = ws_url
        self.token = token
        self.stop_event.clear()
        self.thread = threading.Thread(target=self._run, daemon=True)
        self.thread.start()
        return "Connecting to WebSocket"

    def stop(self) -> str:
        self.stop_event.set()
        return "WebSocket stopped"

    def clear(self) -> None:
        with self.lock:
            self.buffer.clear()

    def snapshot(self) -> List[Dict[str, Any]]:
        with self.lock:
            return list(self.buffer)

    def _append(self, event: Dict[str, Any]) -> None:
        with self.lock:
            self.buffer.append(event)

    def _run(self) -> None:
        try:
            import asyncio
            import websockets
        except Exception as exc:
            self.last_error = f"WebSocket dependency missing: {exc}"
            self.connected = False
            return

        asyncio.run(self._listen(websockets))

    async def _listen(self, websockets_module: Any) -> None:
        base_url = self.ws_url
        if self.token:
            base_url = f"{base_url}?{urlencode({'token': self.token})}"

        while not self.stop_event.is_set():
            try:
                async with websockets_module.connect(
                    base_url,
                    ping_interval=20,
                    ping_timeout=20,
                    max_size=4 * 1024 * 1024,
                ) as socket:
                    self.connected = True
                    self.last_error = ""
                    while not self.stop_event.is_set():
                        try:
                            message = await asyncio.wait_for(socket.recv(), timeout=1.0)
                        except asyncio.TimeoutError:
                            continue
                        except Exception:
                            break
                        event = parse_event_message(message)
                        if event:
                            self._append(event)
            except Exception as exc:
                self.connected = False
                self.last_error = str(exc)
                if self.stop_event.is_set():
                    break
                await asyncio.sleep(2)


def parse_event_message(message: str) -> Optional[Dict[str, Any]]:
    try:
        data = json.loads(message)
    except ValueError:
        return None

    if data.get("type") == "event" and isinstance(data.get("event"), dict):
        return data.get("event")

    if data.get("type") == "connected":
        return {
            "type": "connected",
            "timestamp": data.get("ts") or int(time.time() * 1000),
            "payload": {"userId": data.get("userId")},
        }

    return None


def format_timestamp(value: Any) -> str:
    if value is None:
        return "--:--:--"
    try:
        ts = float(value)
    except (TypeError, ValueError):
        return str(value)
    if ts > 1e12:
        ts = ts / 1000.0
    return time.strftime("%H:%M:%S", time.localtime(ts))


def format_event_log(
    events: List[Dict[str, Any]], filter_text: Optional[str], limit: int
) -> str:
    lines: List[str] = []
    needle = (filter_text or "").strip().lower()
    for event in events[-limit:]:
        event_type = str(event.get("type", "event"))
        timestamp = format_timestamp(event.get("timestamp"))
        payload = event.get("payload") or {}
        summary = safe_json(payload)
        line = f"{timestamp} {event_type} {summary}"
        if needle and needle not in line.lower():
            continue
        lines.append(line)
    return "\n".join(lines)


def derive_ws_url(api_base: str) -> str:
    if api_base.startswith("https://"):
        return api_base.replace("https://", "wss://", 1)
    if api_base.startswith("http://"):
        return api_base.replace("http://", "ws://", 1)
    return f"ws://{api_base.lstrip('/')}"


OLLAMA_CACHE = OllamaModelCache(ttl_seconds=30)
EVENT_STREAM = EventStream(max_events=500)


def get_model_choices(
    provider: str, ollama_host: str, allowlist: Optional[str], refresh: bool
) -> List[str]:
    allow_items = parse_allowlist(allowlist)
    if provider == "ollama":
        fetched = OLLAMA_CACHE.list_models(ollama_host, allow_items, refresh=refresh)
        merged = list(dict.fromkeys([*fetched, *PREFERRED_OLLAMA_MODELS]))
        if allow_items:
            allow_set = set(allow_items)
            merged = [m for m in merged if m in allow_set]
        return merged
    if provider == "openai":
        return list(OPENAI_MODELS)
    return list(MOCK_MODELS)


def update_model_dropdown(
    provider: str, ollama_host: str, allowlist: Optional[str], current: str
) -> gr.Dropdown:
    choices = get_model_choices(provider, ollama_host, allowlist, refresh=True)
    selected = current if current in choices else choices[0]
    return gr.update(choices=choices, value=selected)


def apply_settings(
    api_base: str,
    timeout: int,
    provider: str,
    model: str,
    ollama_host: str,
    allowlist: Optional[str],
    ws_token: str,
    include_hint: bool,
) -> Tuple[Dict[str, Any], str]:
    timeout_value = int(timeout) if timeout else DEFAULT_TIMEOUT
    settings = {
        "api_base": normalize_api_base(api_base),
        "timeout": timeout_value,
        "provider": provider,
        "model": model,
        "ollama_host": (ollama_host.strip() or DEFAULT_OLLAMA_HOST).rstrip("/"),
        "allowlist": allowlist or "",
        "ws_token": ws_token.strip(),
        "include_hint": include_hint,
    }
    header = f"Provider: {provider} | Model: {model}"
    return settings, header


def build_input(prompt: str, settings: Dict[str, Any]) -> str:
    if not settings.get("include_hint"):
        return prompt
    provider = settings.get("provider")
    model = settings.get("model")
    return f"[provider={provider} model={model}] {prompt}"


def run_agent(
    user_input: str,
    history: Any,
    settings: Dict[str, Any],
) -> Any:
    if not user_input.strip():
        return as_chat_messages(history), "", "Provide a task before running the agent."

    client = ApiClient(settings["api_base"], settings["timeout"])
    prepared = build_input(user_input, settings)
    start = time.time()

    messages = as_chat_messages(history)
    messages.append({"role": "user", "content": user_input})
    messages.append({"role": "assistant", "content": "Running..."})
    yield messages, "", "Submitting request"

    result_container: Dict[str, Any] = {}

    def _request() -> None:
        result, _latency = client.agent_run(prepared)
        result_container.update(result)

    thread = threading.Thread(target=_request)
    thread.start()

    while thread.is_alive():
        elapsed = time.time() - start
        events = EVENT_STREAM.snapshot()
        log = format_event_log(events, "", 40)
        messages[-1] = {
            "role": "assistant",
            "content": f"Running... ({elapsed:.1f}s)",
        }
        yield messages, log, "Waiting for agent response"
        time.sleep(0.4)

    if not result_container:
        messages[-1] = {"role": "assistant", "content": "No response from API."}
        return (
            messages,
            format_event_log(EVENT_STREAM.snapshot(), "", 40),
            "No response",
        )

    if not result_container.get("ok"):
        messages[-1] = {
            "role": "assistant",
            "content": safe_json(result_container.get("error")),
        }
        return (
            messages,
            format_event_log(EVENT_STREAM.snapshot(), "", 40),
            "Request failed",
        )

    payload = result_container.get("data")
    if isinstance(payload, dict) and payload.get("ok") is True and "value" in payload:
        payload = payload.get("value")

    answer = ""
    if isinstance(payload, dict):
        answer = payload.get("answer") or payload.get("content") or safe_json(payload)
    else:
        answer = str(payload)

    messages[-1] = {"role": "assistant", "content": answer}
    return messages, format_event_log(EVENT_STREAM.snapshot(), "", 40), "Agent complete"


def refresh_tools(
    settings: Dict[str, Any],
) -> Tuple[List[Dict[str, Any]], gr.Dropdown, str]:
    client = ApiClient(settings["api_base"], settings["timeout"])
    result, _latency = client.tools_list()
    if not result.get("ok"):
        return (
            [],
            gr.update(choices=[], value=None),
            f"Tools error: {result.get('error')}",
        )
    tools = result.get("data") or []
    tool_ids = [tool.get("id", "") for tool in tools if isinstance(tool, dict)]
    default_value = tool_ids[0] if tool_ids else None
    return tools, gr.update(choices=tool_ids, value=default_value), "Tools loaded"


def select_tool(tool_id: str, tools: List[Dict[str, Any]]) -> Tuple[str, str, str]:
    for tool in tools:
        if tool.get("id") == tool_id:
            schema = safe_json(tool.get("schema", {}))
            permissions = ",".join(tool.get("permissions", []) or [])
            return tool.get("description", ""), schema, permissions
    return "", "{}", ""


def invoke_tool(
    tool_id: str,
    args_text: str,
    permissions_text: str,
    settings: Dict[str, Any],
) -> Tuple[str, str]:
    if not tool_id:
        return "Select a tool before invoking.", ""
    try:
        args = json.loads(args_text) if args_text.strip() else {}
    except ValueError as exc:
        return f"Invalid JSON args: {exc}", ""

    permissions = parse_allowlist(permissions_text)
    client = ApiClient(settings["api_base"], settings["timeout"])
    result, _latency = client.tools_invoke(tool_id, args, permissions or None)
    if not result.get("ok"):
        return f"Invoke failed: {safe_json(result.get('error'))}", ""
    return "Tool invoked", safe_json(result.get("data"))


def refresh_vfs(
    settings: Dict[str, Any], filter_text: str
) -> Tuple[List[str], gr.Dropdown, str]:
    client = ApiClient(settings["api_base"], settings["timeout"])
    result, _latency = client.vfs_list()
    if not result.get("ok"):
        return (
            [],
            gr.update(choices=[], value=None),
            f"VFS error: {result.get('error')}",
        )
    files = result.get("data") or []
    if filter_text.strip():
        files = [path for path in files if filter_text.lower() in path.lower()]
    default_value = files[0] if files else None
    return files, gr.update(choices=files, value=default_value), "VFS list updated"


def read_file(path: str, settings: Dict[str, Any]) -> Tuple[str, str]:
    if not path:
        return "", "Select a file to read"
    client = ApiClient(settings["api_base"], settings["timeout"])
    result, _latency = client.vfs_read(path)
    if not result.get("ok"):
        return "", f"Read failed: {safe_json(result.get('error'))}"
    payload = result.get("data") or {}
    return payload.get("content", ""), f"Read {payload.get('path', path)}"


def save_file(path: str, content: str, settings: Dict[str, Any]) -> str:
    if not path:
        return "Provide a file path before saving"
    client = ApiClient(settings["api_base"], settings["timeout"])
    result, _latency = client.vfs_write(path, content)
    if not result.get("ok"):
        return f"Save failed: {safe_json(result.get('error'))}"
    return f"Saved {path}"


def delete_file(path: str, settings: Dict[str, Any]) -> str:
    if not path:
        return "Provide a file path before deleting"
    client = ApiClient(settings["api_base"], settings["timeout"])
    result, _latency = client.vfs_delete(path)
    if not result.get("ok"):
        return f"Delete failed: {safe_json(result.get('error'))}"
    return f"Deleted {path}"


def find_in_file(content: str, query: str) -> str:
    if not query:
        return "Enter a search query"
    lines = content.splitlines()
    matches = [
        str(index + 1)
        for index, line in enumerate(lines)
        if query.lower() in line.lower()
    ]
    if not matches:
        return "No matches"
    return f"Matches on lines: {', '.join(matches[:20])}"


def connect_events(settings: Dict[str, Any]) -> str:
    ws_url = derive_ws_url(settings["api_base"])
    return EVENT_STREAM.start(ws_url, settings.get("ws_token", ""))


def disconnect_events() -> str:
    return EVENT_STREAM.stop()


def clear_events() -> str:
    EVENT_STREAM.clear()
    return "Event log cleared"


def poll_events(
    settings: Dict[str, Any], filter_text: Optional[str], limit: int
) -> Tuple[str, Dict[str, Any], str]:
    events = EVENT_STREAM.snapshot()
    if not events:
        client = ApiClient(settings["api_base"], settings["timeout"])
        result, _latency = client.events_history()
        if result.get("ok"):
            events = result.get("data") or []
    log = format_event_log(events, filter_text, int(limit))
    last_event = events[-1] if events else {}
    if EVENT_STREAM.connected:
        status = "WebSocket connected"
    elif EVENT_STREAM.last_error:
        status = f"WebSocket error: {EVENT_STREAM.last_error}"
    else:
        status = "WebSocket disconnected, showing history"
    return log, last_event, status


def update_status(settings: Dict[str, Any]) -> str:
    client = ApiClient(settings["api_base"], settings["timeout"])
    result, latency = client.health()
    latency_ms = int(latency * 1000)
    if result.get("ok"):
        indicator = "online"
        status_text = "API online"
    else:
        indicator = "offline"
        status_text = "API offline"
    provider = settings.get("provider")
    model = settings.get("model")
    return (
        f"<div class='status {indicator}'>"
        f"<span class='dot'></span>"
        f"<span class='status-text'>{status_text}</span>"
        f"<span class='status-meta'>Provider: {provider}</span>"
        f"<span class='status-meta'>Model: {model}</span>"
        f"<span class='status-meta'>Latency: {latency_ms} ms</span>"
        f"</div>"
    )


def switch_panel(
    selection: str,
) -> Tuple[gr.Column, gr.Column, gr.Column, gr.Column, gr.Column]:
    return (
        gr.update(visible=selection == "Chat"),
        gr.update(visible=selection == "Tools"),
        gr.update(visible=selection == "VFS"),
        gr.update(visible=selection == "Events"),
        gr.update(visible=selection == "Settings"),
    )


CSS = """
:root {
  --vscode-bg: #1e1e1e;
  --vscode-bg-secondary: #151515;
  --vscode-panel: #252526;
  --vscode-panel-alt: #2d2d2d;
  --vscode-border: #333333;
  --vscode-text: #d4d4d4;
  --vscode-muted: #9aa1a6;
  --vscode-accent: #0e639c;
  --vscode-accent-strong: #1177bb;
  --vscode-success: #38a169;
  --vscode-error: #e06c75;
  --vscode-warning: #d19a66;
  --vscode-input: #3c3c3c;
  --vscode-input-border: #565656;
  --vscode-shadow: rgba(0, 0, 0, 0.4);
}

body, .gradio-container {
  background: radial-gradient(circle at 0% 0%, #232323 0%, #1b1b1b 40%, #141414 100%);
  color: var(--vscode-text);
  font-family: "Cascadia Code", "Fira Code", "Consolas", "Segoe UI", sans-serif;
}

.gradio-container::before {
  content: "";
  position: fixed;
  inset: 0;
  background-image: linear-gradient(135deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0) 60%);
  pointer-events: none;
  z-index: 0;
}

#layout {
  min-height: 92vh;
  z-index: 1;
}

#sidebar {
  background: linear-gradient(180deg, #1b1b1b 0%, #202020 100%);
  border-right: 1px solid var(--vscode-border);
  padding: 16px 12px;
  box-shadow: inset -6px 0 12px rgba(0,0,0,0.2);
}

#sidebar h1 {
  font-size: 16px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--vscode-muted);
  margin-bottom: 12px;
}

#nav {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

#nav .wrap {
  background: transparent;
  border: 1px solid transparent;
}

#nav input[type="radio"] {
  accent-color: var(--vscode-accent);
}

#nav label {
  background: var(--vscode-panel);
  border: 1px solid var(--vscode-border);
  padding: 10px 12px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--vscode-text);
  transition: background 0.2s ease, border 0.2s ease, transform 0.2s ease;
}

#nav label:hover {
  border-color: var(--vscode-accent);
  transform: translateX(2px);
}

#main {
  padding: 18px 20px;
}

.panel {
  animation: panelFade 0.35s ease;
}

@keyframes panelFade {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

.section-card {
  background: var(--vscode-panel);
  border: 1px solid var(--vscode-border);
  border-radius: 10px;
  padding: 16px;
  box-shadow: 0 8px 20px var(--vscode-shadow);
}

.section-card h2 {
  margin-top: 0;
  font-size: 18px;
}

.gr-textbox, .gr-dropdown, .gr-code, textarea, input, select {
  background: var(--vscode-input) !important;
  color: var(--vscode-text) !important;
  border-color: var(--vscode-input-border) !important;
}

#status-bar {
  margin-top: 8px;
}

.status {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 8px 14px;
  background: var(--vscode-panel);
  border: 1px solid var(--vscode-border);
  border-radius: 8px;
}

.status .dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--vscode-success);
  box-shadow: 0 0 8px rgba(56,161,105,0.7);
}

.status.offline .dot {
  background: var(--vscode-error);
  box-shadow: 0 0 8px rgba(224,108,117,0.7);
}

.status-meta {
  color: var(--vscode-muted);
  font-size: 12px;
}

.chat-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

#chatbot {
  border: 1px solid var(--vscode-border);
  border-radius: 10px;
  background: var(--vscode-bg-secondary);
}

.chat-log {
  font-family: "Cascadia Code", "Fira Code", "Consolas", monospace;
}

.panel-columns {
  gap: 18px;
}
"""


with gr.Blocks(title="Arium VSCode UI") as demo:
    settings_state = gr.State(
        {
            "api_base": DEFAULT_API_BASE,
            "timeout": DEFAULT_TIMEOUT,
            "provider": DEFAULT_PROVIDER,
            "model": DEFAULT_MODEL,
            "ollama_host": DEFAULT_OLLAMA_HOST,
            "allowlist": "",
            "ws_token": "",
            "include_hint": False,
        }
    )
    tools_state = gr.State([])
    vfs_state = gr.State([])

    with gr.Row(elem_id="layout"):
        with gr.Column(scale=1, elem_id="sidebar"):
            gr.HTML("<h1>Arium</h1>")
            nav = gr.Radio(
                ["Chat", "Tools", "VFS", "Events", "Settings"],
                value="Chat",
                label="",
                elem_id="nav",
            )

        with gr.Column(scale=5, elem_id="main"):
            chat_panel = gr.Column(visible=True, elem_classes=["panel", "chat-panel"])
            tools_panel = gr.Column(visible=False, elem_classes=["panel"])
            vfs_panel = gr.Column(visible=False, elem_classes=["panel"])
            events_panel = gr.Column(visible=False, elem_classes=["panel"])
            settings_panel = gr.Column(visible=False, elem_classes=["panel"])

            with chat_panel:
                gr.HTML("<div class='section-card'><h2>Agent Chat</h2></div>")
                chat_header = gr.Markdown(
                    "Provider: ollama | Model: gemma-3-abliterated:latest"
                )
                with gr.Row(elem_classes=["panel-columns"]):
                    with gr.Column(scale=3):
                        chatbot = gr.Chatbot(
                            elem_id="chatbot",
                            elem_classes=["chat-log"],
                            height=420,
                        )
                        user_input = gr.Textbox(
                            label="Task",
                            placeholder="Describe the task for the agent",
                            lines=3,
                        )
                        with gr.Row():
                            run_btn = gr.Button("Run Agent")
                            clear_btn = gr.Button("Clear")
                    with gr.Column(scale=2):
                        gr.Markdown("Agent Stream")
                        agent_log = gr.Textbox(lines=18, elem_id="agent-log")
                        agent_status = gr.Markdown("Idle")

            with tools_panel:
                gr.HTML("<div class='section-card'><h2>Tools</h2></div>")
                tools_status = gr.Markdown("Use Refresh to load tools from the API.")
                with gr.Row(elem_classes=["panel-columns"]):
                    with gr.Column(scale=2):
                        refresh_tools_btn = gr.Button("Refresh Tools")
                        tool_selector = gr.Dropdown(choices=[], label="Tool ID")
                        tool_description = gr.Textbox(label="Description", lines=4)
                        tool_permissions = gr.Textbox(
                            label="Default Permissions", lines=2
                        )
                    with gr.Column(scale=3):
                        tool_schema = gr.Code(
                            label="Schema", language="json", value="{}"
                        )
                        tool_args = gr.Code(
                            label="Args (JSON)", language="json", value="{}"
                        )
                        tool_permissions_input = gr.Textbox(
                            label="Permissions Override (comma-separated)", lines=2
                        )
                        invoke_btn = gr.Button("Invoke Tool")
                        tool_result = gr.Code(label="Result", language="json")

            with vfs_panel:
                gr.HTML("<div class='section-card'><h2>Virtual File System</h2></div>")
                vfs_status = gr.Markdown("Use Refresh to load files.")
                with gr.Row(elem_classes=["panel-columns"]):
                    with gr.Column(scale=2):
                        vfs_filter = gr.Textbox(
                            label="Filter", placeholder="Filter file list"
                        )
                        refresh_vfs_btn = gr.Button("Refresh Files")
                        vfs_selector = gr.Dropdown(choices=[], label="File")
                        file_path = gr.Textbox(
                            label="Path", placeholder="path/to/file.txt"
                        )
                        read_btn = gr.Button("Read")
                        delete_btn = gr.Button("Delete")
                    with gr.Column(scale=3):
                        file_content = gr.Textbox(label="Content", lines=18)
                        with gr.Row():
                            save_btn = gr.Button("Save")
                            find_query = gr.Textbox(
                                label="Find", placeholder="Search in file"
                            )
                        find_btn = gr.Button("Find")
                        find_result = gr.Markdown("")

            with events_panel:
                gr.HTML("<div class='section-card'><h2>Events</h2></div>")
                events_status = gr.Markdown("WebSocket is idle.")
                with gr.Row(elem_classes=["panel-columns"]):
                    with gr.Column(scale=2):
                        connect_btn = gr.Button("Connect WebSocket")
                        disconnect_btn = gr.Button("Disconnect")
                        clear_events_btn = gr.Button("Clear Log")
                        events_filter = gr.Textbox(
                            label="Filter", placeholder="Filter by type or payload"
                        )
                        events_limit = gr.Number(
                            label="Max Events", value=DEFAULT_EVENT_LIMIT, precision=0
                        )
                    with gr.Column(scale=3):
                        events_log = gr.Textbox(label="Event Log", lines=20)
                        last_event = gr.JSON(label="Last Event")

            with settings_panel:
                gr.HTML("<div class='section-card'><h2>Settings</h2></div>")
                gr.Markdown(
                    "Apply Settings to update the active configuration used by requests."
                )
                gr.Markdown(
                    "Provider/model selection is UI-side; update server env vars to change adapters."
                )
                api_base = gr.Textbox(label="API Base URL", value=DEFAULT_API_BASE)
                timeout = gr.Number(
                    label="Timeout (seconds)", value=DEFAULT_TIMEOUT, precision=0
                )
                provider = gr.Dropdown(
                    label="Provider", choices=PROVIDERS, value=DEFAULT_PROVIDER
                )
                model = gr.Dropdown(
                    label="Model", choices=[DEFAULT_MODEL], value=DEFAULT_MODEL
                )
                refresh_models_btn = gr.Button("Refresh Models")
                ollama_host = gr.Textbox(label="Ollama Host", value=DEFAULT_OLLAMA_HOST)
                allowlist = gr.Textbox(
                    label="Ollama Allowlist (comma-separated)",
                    placeholder="model-a,model-b",
                )
                ws_token = gr.Textbox(
                    label="WebSocket Token", placeholder="JWT token", type="password"
                )
                include_hint = gr.Checkbox(
                    label="Inject provider/model hint into agent input", value=False
                )
                apply_btn = gr.Button("Apply Settings")

    status_bar = gr.HTML(elem_id="status-bar")

    nav.change(
        switch_panel,
        inputs=[nav],
        outputs=[chat_panel, tools_panel, vfs_panel, events_panel, settings_panel],
    )

    refresh_models_btn.click(
        update_model_dropdown,
        inputs=[provider, ollama_host, allowlist, model],
        outputs=[model],
    )

    provider.change(
        update_model_dropdown,
        inputs=[provider, ollama_host, allowlist, model],
        outputs=[model],
    )

    apply_btn.click(
        apply_settings,
        inputs=[
            api_base,
            timeout,
            provider,
            model,
            ollama_host,
            allowlist,
            ws_token,
            include_hint,
        ],
        outputs=[settings_state, chat_header],
    )

    run_btn.click(
        run_agent,
        inputs=[user_input, chatbot, settings_state],
        outputs=[chatbot, agent_log, agent_status],
    )

    clear_btn.click(
        lambda: ([], "", "Idle"), outputs=[chatbot, agent_log, agent_status]
    )

    refresh_tools_btn.click(
        refresh_tools,
        inputs=[settings_state],
        outputs=[tools_state, tool_selector, tools_status],
    )

    tool_selector.change(
        select_tool,
        inputs=[tool_selector, tools_state],
        outputs=[tool_description, tool_schema, tool_permissions],
    )

    invoke_btn.click(
        invoke_tool,
        inputs=[tool_selector, tool_args, tool_permissions_input, settings_state],
        outputs=[tools_status, tool_result],
    )

    refresh_vfs_btn.click(
        refresh_vfs,
        inputs=[settings_state, vfs_filter],
        outputs=[vfs_state, vfs_selector, vfs_status],
    )

    vfs_selector.change(
        lambda path: path or "", inputs=[vfs_selector], outputs=[file_path]
    )

    read_btn.click(
        read_file,
        inputs=[file_path, settings_state],
        outputs=[file_content, vfs_status],
    )

    save_btn.click(
        save_file,
        inputs=[file_path, file_content, settings_state],
        outputs=[vfs_status],
    )

    delete_btn.click(
        delete_file, inputs=[file_path, settings_state], outputs=[vfs_status]
    )

    find_btn.click(
        find_in_file, inputs=[file_content, find_query], outputs=[find_result]
    )

    connect_btn.click(connect_events, inputs=[settings_state], outputs=[events_status])
    disconnect_btn.click(disconnect_events, outputs=[events_status])
    clear_events_btn.click(clear_events, outputs=[events_status])

    event_timer = gr.Timer(1.5, active=True)
    event_timer.tick(
        poll_events,
        inputs=[settings_state, events_filter, events_limit],
        outputs=[events_log, last_event, events_status],
    )

    status_timer = gr.Timer(4.0, active=True)
    status_timer.tick(update_status, inputs=[settings_state], outputs=[status_bar])

    demo.load(
        update_model_dropdown,
        inputs=[provider, ollama_host, allowlist, model],
        outputs=[model],
    )


if __name__ == "__main__":
    start_port = get_int_env("GRADIO_PORT", 7860)
    port = find_available_port(start_port)
    demo.queue(default_concurrency_limit=2).launch(
        server_name=DEFAULT_SERVER_NAME,
        server_port=port,
        css=CSS,
    )
