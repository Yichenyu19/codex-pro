from __future__ import annotations

import json
import shutil
import socket
import os
import pathlib
import subprocess
import sys
import threading
import time
import uuid
from typing import Any
from urllib.request import urlopen

try:
    import websocket
except ModuleNotFoundError as error:
    missing_module = error.name or "websocket"
    install_cmd = f'py -m pip install -r "{pathlib.Path(__file__).resolve().parent / "requirements.txt"}"'
    print(
        "Codex Pro 启动器缺少 Python 依赖："
        f"{missing_module}\n"
        f"请先执行：{install_cmd}",
        file=sys.stderr,
    )
    raise SystemExit(1) from error


DEFAULT_DEBUG_PORT = 9333
DEFAULT_BRIDGE_PORT = 8765
BRIDGE_BINDING_NAME = "codexHistoryGuardBridge"
LOG_DIR_NAME = ".codex-pro"
LEGACY_LOG_DIR_NAME = ".codex-guard"
LEGACY_HISTORY_LOG_DIR_NAME = ".codex-history-guard"
LOG_FILE_NAME = "launcher.log"
LAUNCH_LOCK_FILENAME = "launcher.lock"
DIAG_STATE_FILENAME = "cdp-diagnosis.json"
DIAG_DEBUG_PORT = 9444
LAUNCH_VARIANT = "agent-debug"
ENV_GUARD_APP_DIR = "CODEX_PRO_APP_DIR"
ENV_DEBUG_PORT = "CODEX_PRO_DEBUG_PORT"
ENV_BRIDGE_PORT = "CODEX_PRO_BRIDGE_PORT"
ENV_BRIDGE_TOKEN = "CODEX_PRO_BRIDGE_TOKEN"
ENV_USER_DATA_DIR = "CODEX_PRO_USER_DATA_DIR"
LEGACY_ENV_GUARD_APP_DIR = "CODEX_GUARD_APP_DIR"
LEGACY_ENV_DEBUG_PORT = "CODEX_GUARD_DEBUG_PORT"
LEGACY_ENV_BRIDGE_PORT = "CODEX_GUARD_BRIDGE_PORT"
LEGACY_ENV_USER_DATA_DIR = "CODEX_GUARD_USER_DATA_DIR"
LEGACY_HISTORY_ENV_GUARD_APP_DIR = "CODEX_HISTORY_GUARD_APP_DIR"
LEGACY_HISTORY_ENV_DEBUG_PORT = "CODEX_HISTORY_GUARD_DEBUG_PORT"
LEGACY_HISTORY_ENV_BRIDGE_PORT = "CODEX_HISTORY_GUARD_BRIDGE_PORT"
LEGACY_HISTORY_ENV_USER_DATA_DIR = "CODEX_HISTORY_GUARD_USER_DATA_DIR"


class CompatibilityModeRequired(RuntimeError):
    """Raised when the launcher should stop attaching and continue in compatibility mode."""


def repo_root() -> pathlib.Path:
    return pathlib.Path(__file__).resolve().parent.parent


def guard_app_dir() -> pathlib.Path:
    override = str(
        os.environ.get(ENV_GUARD_APP_DIR, "")
        or os.environ.get(LEGACY_ENV_GUARD_APP_DIR, "")
        or os.environ.get(LEGACY_HISTORY_ENV_GUARD_APP_DIR, "")
    ).strip()
    if override:
        return pathlib.Path(override).expanduser()
    return pathlib.Path.home() / LOG_DIR_NAME


def log_dir() -> pathlib.Path:
    return guard_app_dir()


def log_path() -> pathlib.Path:
    return log_dir() / LOG_FILE_NAME


def launch_lock_path() -> pathlib.Path:
    return log_dir() / LAUNCH_LOCK_FILENAME


def diagnosis_state_path() -> pathlib.Path:
    return log_dir() / DIAG_STATE_FILENAME


def configured_port(env_name: str, default_port: int) -> int:
    legacy_env_name = {
        ENV_DEBUG_PORT: LEGACY_ENV_DEBUG_PORT,
        ENV_BRIDGE_PORT: LEGACY_ENV_BRIDGE_PORT,
    }.get(env_name)
    legacy_history_env_name = {
        ENV_DEBUG_PORT: LEGACY_HISTORY_ENV_DEBUG_PORT,
        ENV_BRIDGE_PORT: LEGACY_HISTORY_ENV_BRIDGE_PORT,
    }.get(env_name)
    raw_value = str(
        os.environ.get(env_name, "")
        or (os.environ.get(legacy_env_name, "") if legacy_env_name else "")
        or (os.environ.get(legacy_history_env_name, "") if legacy_history_env_name else "")
    ).strip()
    if not raw_value:
        return default_port
    try:
        return int(raw_value)
    except ValueError as error:
        raise RuntimeError(
            f"{env_name} 必须是整数端口，当前值：{raw_value}"
        ) from error


def configured_codex_extra_args(extra_args: list[str] | None = None) -> list[str]:
    merged = list(extra_args or [])
    user_data_dir = str(
        os.environ.get(ENV_USER_DATA_DIR, "")
        or os.environ.get(LEGACY_ENV_USER_DATA_DIR, "")
        or os.environ.get(LEGACY_HISTORY_ENV_USER_DATA_DIR, "")
    ).strip()
    if user_data_dir and not any(str(arg).startswith("--user-data-dir=") for arg in merged):
        merged.append(f"--user-data-dir={user_data_dir}")
    return merged


def ensure_console_utf8() -> None:
    for stream_name in ("stdout", "stderr"):
        stream = getattr(sys, stream_name, None)
        reconfigure = getattr(stream, "reconfigure", None)
        if callable(reconfigure):
            reconfigure(encoding="utf-8", errors="replace")


def append_log(message: str) -> None:
    log_dir().mkdir(parents=True, exist_ok=True)
    with log_path().open("a", encoding="utf-8") as handle:
        handle.write(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] {message}\n")


def read_launch_lock_pid() -> int | None:
    path = launch_lock_path()
    if not path.exists():
        return None
    try:
        return int(path.read_text(encoding="utf-8").strip().splitlines()[0])
    except Exception:  # noqa: BLE001
        return None


def acquire_launch_lock() -> int | None:
    log_dir().mkdir(parents=True, exist_ok=True)
    path = launch_lock_path()
    existing_pid = read_launch_lock_pid()
    if existing_pid is not None and is_process_running(existing_pid):
        append_log(f"Launcher lock already held by PID {existing_pid}; skipping duplicate launch.")
        return None
    try:
        path.unlink()
    except FileNotFoundError:
        pass
    fd = os.open(str(path), os.O_CREAT | os.O_EXCL | os.O_WRONLY)
    os.write(fd, f"{os.getpid()}\n".encode("utf-8"))
    return fd


def release_launch_lock(lock_fd: int | None) -> None:
    if lock_fd is not None:
        try:
            os.close(lock_fd)
        except OSError:
            pass
    try:
        launch_lock_path().unlink()
    except FileNotFoundError:
        pass


def executable_signature(executable_path: str) -> dict[str, Any]:
    stat = pathlib.Path(executable_path).stat()
    return {
        "path": executable_path,
        "size": stat.st_size,
        "mtime_ns": stat.st_mtime_ns,
        "launcher_variant": LAUNCH_VARIANT,
    }


def load_diagnosis_state() -> dict[str, Any] | None:
    path = diagnosis_state_path()
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception as error:  # noqa: BLE001
        append_log(f"Failed to read CDP diagnosis cache: {error}")
        return None


def save_diagnosis_state(status: str, executable_path: str, message: str) -> None:
    log_dir().mkdir(parents=True, exist_ok=True)
    payload = {
        "status": status,
        "message": message,
        "saved_at": time.strftime("%Y-%m-%d %H:%M:%S"),
        "signature": executable_signature(executable_path),
    }
    diagnosis_state_path().write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def get_cached_diagnosis_for(executable_path: str) -> dict[str, Any] | None:
    payload = load_diagnosis_state()
    if not isinstance(payload, dict):
        return None
    signature = payload.get("signature")
    if not isinstance(signature, dict):
        return None
    if signature != executable_signature(executable_path):
        return None
    return payload


def port_available(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            sock.bind(("127.0.0.1", port))
        except OSError:
            return False
    return True


def choose_available_port(preferred_port: int, label: str, max_attempts: int = 20) -> int:
    for offset in range(max_attempts):
        candidate = preferred_port + offset
        if port_available(candidate):
            if candidate != preferred_port:
                append_log(f"{label} port {preferred_port} unavailable, switched to {candidate}.")
            return candidate
    raise RuntimeError(f"未找到可用的 {label} 端口，起始端口 {preferred_port}。")


def can_connect(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(0.3)
        return sock.connect_ex(("127.0.0.1", port)) == 0


def is_process_running(pid: int | None) -> bool:
    if pid is None:
        return False
    try:
        os.kill(pid, 0)
    except OSError:
        return False
    return True


def running_desktop_codex_processes() -> list[dict[str, str]]:
    if os.name != "nt":
        return []

    query = (
        "Get-CimInstance Win32_Process | "
        "Where-Object { $_.Name -eq 'Codex.exe' } | "
        "Select-Object ProcessId,CommandLine,ExecutablePath | ConvertTo-Json -Depth 3"
    )
    try:
        result = subprocess.run(
            ["pwsh", "-NoProfile", "-Command", query],
            capture_output=True,
            text=True,
            check=False,
            timeout=10,
        )
    except Exception as error:  # noqa: BLE001
        append_log(f"Failed to inspect running Codex processes: {error}")
        return []

    if result.returncode != 0:
        append_log(f"Codex process inspection failed: {result.stderr.strip()}")
        return []

    stdout = result.stdout.strip()
    if not stdout:
        return []

    try:
        payload = json.loads(stdout)
    except json.JSONDecodeError as error:
        append_log(f"Unable to decode Codex process inspection output: {error}")
        return []

    if isinstance(payload, dict):
        payload = [payload]
    if not isinstance(payload, list):
        return []

    processes: list[dict[str, str]] = []
    for item in payload:
        if not isinstance(item, dict):
            continue
        processes.append({
            "process_id": str(item.get("ProcessId", "")),
            "command_line": str(item.get("CommandLine", "") or ""),
            "executable_path": str(item.get("ExecutablePath", "") or ""),
        })
    return processes


def codex_executable() -> str:
    def is_cli_binary(candidate_path: str) -> bool:
        normalized = candidate_path.replace("/", "\\").lower()
        return (
            "\\openai\\codex\\bin\\codex.exe" in normalized
            or normalized.endswith("\\app\\resources\\codex.exe")
        )

    # Prefer desktop-style installation first.
    candidates = [
        os.path.expandvars(r"%LOCALAPPDATA%\Programs\Codex\Codex.exe"),
    ]
    where_codex = shutil.which("Codex.exe") or shutil.which("codex.exe")
    if where_codex and not is_cli_binary(where_codex):
        candidates.append(where_codex)
    powershell_package = find_codex_windowsapps_package()
    if powershell_package:
        package_path = pathlib.Path(powershell_package)
        candidates.extend([
            str(package_path / "Codex.exe"),
            str(package_path / "app" / "Codex.exe"),
        ])
    for candidate in candidates:
        if os.path.exists(candidate):
            return candidate
    raise FileNotFoundError(
        f"未找到 Codex 可执行文件，请先安装 Codex。日志位置：{log_path()}"
    )


def find_codex_windowsapps_package() -> str | None:
    query = (
        '$pkg = Get-ChildItem "$env:ProgramFiles\\WindowsApps" '
        '-Filter "OpenAI.Codex_*_x64__*" -ErrorAction SilentlyContinue | '
        'Sort-Object Name -Descending | Select-Object -First 1 -ExpandProperty FullName; '
        'if ($pkg) { $pkg }'
    )
    try:
        result = subprocess.run(
            ["pwsh", "-NoProfile", "-Command", query],
            capture_output=True,
            text=True,
            check=False,
            timeout=10,
        )
    except Exception as error:  # noqa: BLE001
        append_log(f"Failed to query WindowsApps Codex package via PowerShell: {error}")
        return None
    if result.returncode != 0:
        append_log(f"PowerShell WindowsApps query failed: {result.stderr.strip()}")
        return None
    package_path = result.stdout.strip().splitlines()
    return package_path[-1].strip() if package_path else None


def find_codex_windowsapps_package_family() -> str | None:
    query = (
        'Get-AppxPackage -Name OpenAI.Codex -ErrorAction SilentlyContinue | '
        'Sort-Object Version -Descending | '
        'Select-Object -First 1 -ExpandProperty PackageFamilyName'
    )
    try:
        result = subprocess.run(
            ["pwsh", "-NoProfile", "-Command", query],
            capture_output=True,
            text=True,
            check=False,
            timeout=10,
        )
    except Exception as error:  # noqa: BLE001
        append_log(f"Failed to query Codex package family via PowerShell: {error}")
        return None
    if result.returncode != 0:
        append_log(f"PowerShell package family query failed: {result.stderr.strip()}")
        return None
    package_family = result.stdout.strip().splitlines()
    return package_family[-1].strip() if package_family else None


def codex_app_activation_uri() -> str:
    package_family = find_codex_windowsapps_package_family() or "OpenAI.Codex_2p2nqsd0c76g0"
    return f"shell:AppsFolder\\{package_family}!App"


def launch_codex_shell_activation() -> subprocess.Popen:
    activation_uri = codex_app_activation_uri()
    append_log(f"Launching Codex through Windows app activation: {activation_uri}")
    return subprocess.Popen(
        ["explorer.exe", activation_uri],
        creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
    )


def start_bridge(port: int, bridge_token: str) -> subprocess.Popen:
    cli_path = repo_root() / "src" / "cli.js"
    append_log(f"Starting local history bridge on port {port}.")
    env = os.environ.copy()
    env[ENV_BRIDGE_TOKEN] = bridge_token
    return subprocess.Popen(
        [
            "node",
            str(cli_path),
            "codex-pro",
            "bridge",
            "--port",
            str(port),
        ],
        cwd=repo_root(),
        env=env,
        creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
    )


def launch_codex_process(args: list[str], working_directory: str) -> subprocess.Popen:
    env = os.environ.copy()
    env["CODEX_ELECTRON_AGENT_RUN_ID"] = env.get("CODEX_ELECTRON_AGENT_RUN_ID", str(uuid.uuid4()))
    return subprocess.Popen(
        args,
        cwd=working_directory,
        env=env,
    )


def start_codex(debug_port: int, extra_args: list[str] | None = None) -> subprocess.Popen:
    executable = codex_executable()
    args = [
        executable,
        f"--remote-debugging-port={debug_port}",
        f"--remote-allow-origins=http://127.0.0.1:{debug_port}",
        *configured_codex_extra_args(extra_args),
    ]
    append_log(f"Launching Codex from {executable} with CDP port {debug_port}.")
    return launch_codex_process(
        args,
        os.path.dirname(executable),
    )


def start_codex_plain() -> subprocess.Popen:
    executable = codex_executable()
    append_log(f"Launching Codex in compatibility mode from {executable}.")
    try:
        return launch_codex_process(
            [executable, *configured_codex_extra_args()],
            os.path.dirname(executable),
        )
    except PermissionError as error:
        append_log(
            "Direct Codex launch was denied; falling back to Windows app activation. "
            f"executable={executable} error={error}"
        )
        return launch_codex_shell_activation()


def wait_for_cdp(debug_port: int, timeout_seconds: int = 30) -> list[dict[str, Any]]:
    deadline = time.time() + timeout_seconds
    last_error: Exception | None = None
    while time.time() < deadline:
        try:
            with urlopen(f"http://127.0.0.1:{debug_port}/json") as response:
                targets = json.loads(response.read().decode("utf-8"))
                if isinstance(targets, list) and targets:
                    return targets
        except Exception as error:  # noqa: BLE001
            last_error = error
            time.sleep(1)
    raise RuntimeError(f"等待 Codex CDP 就绪失败：{last_error}")


def pick_page_target(targets: list[dict[str, Any]]) -> dict[str, Any]:
    pages = [
        target for target in targets
        if target.get("type") == "page" and target.get("webSocketDebuggerUrl")
    ]
    for target in pages:
        label = f"{target.get('title', '')} {target.get('url', '')}".lower()
        if "codex" in label:
            return target
    if pages:
        return pages[0]
    raise RuntimeError("没有找到可注入的 Codex 页面 target。")


def evaluate_script(ws: websocket.WebSocket, script: str, message_id: int) -> dict[str, Any]:
    ws.send(json.dumps({
        "id": message_id,
        "method": "Runtime.evaluate",
        "params": {"expression": script, "awaitPromise": False},
    }))
    while True:
        message = json.loads(ws.recv())
        if message.get("id") == message_id:
            if "error" in message:
                raise RuntimeError(str(message["error"]))
            return message


def evaluate_expression_value(ws: websocket.WebSocket, expression: str, message_id: int) -> Any:
    result = evaluate_script(ws, expression, message_id)
    payload = result.get("result", {}).get("result", {})
    if payload.get("subtype") == "error":
        raise RuntimeError(str(payload))
    return payload.get("value")


def build_bridge_script(binding_name: str) -> str:
    return f"""
(() => {{
  if (window.__codexProBridgeInstalled || window.__codexHistoryGuardBridgeInstalled) return;
  window.__codexProBridgeInstalled = true;
  window.__codexHistoryGuardBridgeInstalled = true;
  window.__codexProPending = new Map();
  window.__codexHistoryGuardPending = window.__codexProPending;
  window.__codexProSeq = 0;
  window.__codexHistoryGuardSeq = window.__codexProSeq;
  window.__codexProResolve = (id, result) => {{
    const pending = window.__codexProPending.get(id);
    if (!pending) return;
    window.__codexProPending.delete(id);
    pending.resolve(result);
  }};
  window.__codexHistoryGuardResolve = window.__codexProResolve;
  window.__codexProReject = (id, message) => {{
    const pending = window.__codexProPending.get(id);
    if (!pending) return;
    window.__codexProPending.delete(id);
    pending.resolve({{ ok: false, error: message, message }});
  }};
  window.__codexHistoryGuardReject = window.__codexProReject;
  window.__codexProBridge = (path, payload = {{}}) => new Promise((resolve) => {{
    const id = String(++window.__codexProSeq);
    window.__codexHistoryGuardSeq = window.__codexProSeq;
    window.__codexProPending.set(id, {{ resolve }});
    window.{binding_name}(JSON.stringify({{ id, path, payload }}));
  }});
  window.__codexHistoryGuardBridge = window.__codexProBridge;
}})();
"""


def install_bridge_socket(websocket_url: str, bridge_port: int) -> websocket.WebSocket:
    ws = websocket.create_connection(websocket_url, timeout=5)
    ws.send(json.dumps({
        "id": 1,
        "method": "Runtime.addBinding",
        "params": {"name": BRIDGE_BINDING_NAME},
    }))
    _wait_for_id(ws, 1)
    evaluate_script(ws, build_bridge_script(BRIDGE_BINDING_NAME), 2)
    return ws


def start_bridge_loop(ws: websocket.WebSocket, bridge_port: int, bridge_token: str) -> None:
    thread = threading.Thread(target=_bridge_loop, args=(ws, bridge_port, bridge_token), daemon=True)
    thread.start()


def _bridge_loop(ws: websocket.WebSocket, bridge_port: int, bridge_token: str) -> None:
    while True:
        try:
            message = json.loads(ws.recv())
        except Exception:  # noqa: BLE001
            return
        if message.get("method") != "Runtime.bindingCalled":
            continue
        params = message.get("params", {})
        try:
            payload = json.loads(str(params.get("payload", "{}")))
            request_id = str(payload.get("id", ""))
            path = str(payload.get("path", ""))
            body = payload.get("payload", {})
            result = call_bridge_http(bridge_port, path, body if isinstance(body, dict) else {}, bridge_token)
            _resolve_bridge(ws, request_id, result)
        except Exception as error:  # noqa: BLE001
            request_id = str(locals().get("payload", {}).get("id", ""))
            if request_id:
                _reject_bridge(ws, request_id, str(error))


def call_bridge_http(port: int, path: str, payload: dict[str, Any], bridge_token: str = "") -> dict[str, Any]:
    import requests

    base = f"http://127.0.0.1:{port}"
    headers = {"X-Codex-Pro-Token": bridge_token} if bridge_token else None
    if path.startswith("/status") or path.startswith("/sessions"):
        response = requests.get(f"{base}{path}", timeout=20, headers=headers)
    else:
        response = requests.post(f"{base}{path}", json=payload, timeout=20, headers=headers)
    response.raise_for_status()
    return response.json()


_message_id = 100
_message_lock = threading.Lock()


def _next_id() -> int:
    global _message_id
    with _message_lock:
        _message_id += 1
        return _message_id


def _wait_for_id(ws: websocket.WebSocket, expected_id: int) -> dict[str, Any]:
    while True:
        message = json.loads(ws.recv())
        if message.get("id") == expected_id:
            if "error" in message:
                raise RuntimeError(str(message["error"]))
            return message


def _resolve_bridge(ws: websocket.WebSocket, request_id: str, result: dict[str, Any]) -> None:
    expression = (
        f"window.__codexHistoryGuardResolve({json.dumps(request_id)}, {json.dumps(result, ensure_ascii=False)})"
    )
    ws.send(json.dumps({
        "id": _next_id(),
        "method": "Runtime.evaluate",
        "params": {"expression": expression, "awaitPromise": False},
    }))


def _reject_bridge(ws: websocket.WebSocket, request_id: str, message: str) -> None:
    expression = (
        f"window.__codexHistoryGuardReject({json.dumps(request_id)}, {json.dumps(message, ensure_ascii=False)})"
    )
    ws.send(json.dumps({
        "id": _next_id(),
        "method": "Runtime.evaluate",
        "params": {"expression": expression, "awaitPromise": False},
    }))


def inject_ui(cdp_targets: list[dict[str, Any]], bridge_port: int, bridge_token: str) -> None:
    target = pick_page_target(cdp_targets)
    websocket_url = str(target["webSocketDebuggerUrl"])
    append_log(f"Injecting UI into target: {target.get('title') or target.get('url')}")
    bridge_socket = install_bridge_socket(websocket_url, bridge_port)
    script = (repo_root() / "inject-ui" / "history-guard-ui.js").read_text(encoding="utf-8")
    prefix = (
        f"window.__CODEX_PRO_HELPER__ = 'http://127.0.0.1:{bridge_port}';\n"
        f"window.__CODEX_HISTORY_GUARD_HELPER__ = window.__CODEX_PRO_HELPER__;\n"
        f"window.__CODEX_PRO_BRIDGE_TOKEN__ = {json.dumps(bridge_token)};\n"
        f"window.__CODEX_HISTORY_GUARD_BRIDGE_TOKEN__ = window.__CODEX_PRO_BRIDGE_TOKEN__;\n"
    )
    evaluate_script(bridge_socket, prefix + script, 3)
    installed = evaluate_expression_value(
        bridge_socket,
        "Boolean(window.__CODEX_PRO_INSTALLED__ || window.__CODEX_HISTORY_GUARD_INSTALLED__)",
        4,
    )
    if installed is not True:
        raise RuntimeError(
            "已连接到 Codex 页面，但这次没有挂上“历史”入口。"
            " 你现在仍可继续使用 Codex；如果需要排查，再查看启动日志或运行 Diagnose Injection。"
        )
    start_bridge_loop(bridge_socket, bridge_port, bridge_token)
    append_log("Codex Pro UI injection completed.")


def verify_bridge(bridge_port: int, bridge_token: str = "") -> None:
    append_log(f"Verifying bridge health on port {bridge_port}.")
    result = call_bridge_http(bridge_port, "/status", {}, bridge_token)
    if "doctor" not in result:
        raise RuntimeError("bridge /status 自检失败：缺少 doctor 字段。")
    append_log("Bridge health check passed.")


def summarize_history_health(status_payload: dict[str, Any]) -> dict[str, Any]:
    doctor = status_payload.get("doctor", {})
    issues: list[str] = []
    missing_roots = doctor.get("missingActiveRoots", [])
    rollout_count = int(doctor.get("rolloutFileCount", 0) or 0)
    session_index_count = int(doctor.get("sessionIndexCount", 0) or 0)

    if isinstance(missing_roots, list) and missing_roots:
        issues.append(f"缺失工作区根 {len(missing_roots)} 项")
    if rollout_count > 0 and session_index_count == 0:
        issues.append("session_index 为空")

    return {
        "provider": doctor.get("currentProvider", "unknown"),
        "rollout_count": rollout_count,
        "session_index_count": session_index_count,
        "saved_roots": int(doctor.get("savedWorkspaceRootCount", 0) or 0),
        "active_roots": int(doctor.get("activeWorkspaceRootCount", 0) or 0),
        "issues": issues,
    }


def print_history_health(summary: dict[str, Any]) -> None:
    print(
        "Codex Pro 状态："
        f" provider={summary['provider']},"
        f" rollout={summary['rollout_count']},"
        f" index={summary['session_index_count']},"
        f" active_roots={summary['active_roots']}/{summary['saved_roots']}"
    )
    if summary["issues"]:
        issues_text = "，".join(summary["issues"])
        print(f"检测到历史异常：{issues_text}")
        print("可直接打开 Codex 内的“历史”执行修复；兼容模式下再去开始菜单里的 Repair History。")
        append_log(f"History issues detected after startup: {issues_text}")
    else:
        print("历史状态正常，未检测到需要立即修复的问题。")
        append_log("No immediate history issues detected after startup.")


def print_compatibility_mode_banner(reason: str, launched: bool) -> None:
    append_log(f"Compatibility mode reason: {reason}")
    print(
        "当前先按兼容方式继续使用，历史保护仍生效。\n"
        "这次页面增强没有挂到当前窗口，但不会影响历史守护、自动快照、修复历史、重建索引和删除撤销。",
        file=sys.stderr,
    )
    if launched:
        print(
            "Codex 已按原生方式启动；以后继续像平常一样打开 Codex 即可。",
            file=sys.stderr,
        )
    else:
        print(
            "当前 Codex 已经在运行，你可以继续使用当前窗口。",
            file=sys.stderr,
        )
    print(
        "如果历史没有自动恢复，固定按三步处理：先修复历史，再重建索引，仍不完整时再打开高级修复入口。",
        file=sys.stderr,
    )
    print(
        "如果你想看这次为什么没有挂上页面增强，再打开开始菜单里的 Diagnose Injection 或查看 launcher.log。",
        file=sys.stderr,
    )
    print(f"详细日志: {log_path()}", file=sys.stderr)


def run_compatibility_mode(reason: str) -> int:
    processes = running_desktop_codex_processes()
    if processes:
        append_log(
            "Compatibility mode activated while Codex is already running. "
            f"process_ids={[process['process_id'] for process in processes]}"
        )
        print_compatibility_mode_banner(reason, launched=False)
        return 0

    codex = start_codex_plain()
    append_log(f"Compatibility mode launched native Codex request {codex.pid}.")
    print_compatibility_mode_banner(reason, launched=True)
    return 0


def cdp_targets_if_running(debug_port: int) -> list[dict[str, Any]] | None:
    if not can_connect(debug_port):
        return None
    append_log(f"Detected running process on CDP port {debug_port}, probing existing targets.")
    try:
        return wait_for_cdp(debug_port, timeout_seconds=3)
    except Exception as error:  # noqa: BLE001
        raise CompatibilityModeRequired(
            "检测到当前已经有一个 Codex 窗口在运行，这次页面增强没能直接附着到它。"
        ) from error


def ensure_desktop_codex_not_running_without_cdp(debug_port: int) -> None:
    if can_connect(debug_port):
        return
    processes = running_desktop_codex_processes()
    if not processes:
        return
    append_log(
        "Detected running Codex Desktop process without CDP. "
        f"count={len(processes)} process_ids={[process['process_id'] for process in processes]}"
    )
    raise CompatibilityModeRequired(
        "检测到 Codex 已经在运行，这次先继续使用当前窗口。"
    )


def raise_cdp_launch_failure(codex: subprocess.Popen | None, debug_port: int, original_error: Exception) -> None:
    executable = codex_executable()
    running_processes = running_desktop_codex_processes()
    if codex is not None and not is_process_running(codex.pid) and running_processes:
        append_log(
            "Codex launch was redirected to an already-running desktop instance before CDP became available. "
            f"spawned_pid={codex.pid} existing_pids={[process['process_id'] for process in running_processes]}"
        )
        raise CompatibilityModeRequired(
            "检测到当前已经有别的 Codex 窗口在运行，这次先继续使用现有窗口。"
        ) from original_error

    if codex is not None and is_process_running(codex.pid) and not can_connect(debug_port):
        append_log(
            "Codex process is still running after launch, but CDP port never opened. "
            f"pid={codex.pid} debug_port={debug_port}"
        )
        save_diagnosis_state(
            "unsupported",
            executable,
            "当前这版 Codex Desktop 这次没有提供页面增强所需接口，系统会自动切到兼容模式继续使用。",
        )
        raise CompatibilityModeRequired(
            "Codex 已经启动，但这次页面增强没能挂上去。"
        ) from original_error

    raise original_error


def terminate_process(process: subprocess.Popen | None, timeout_seconds: float = 8) -> None:
    if process is None or process.poll() is not None:
        return
    try:
        process.terminate()
        process.wait(timeout=timeout_seconds)
    except Exception:  # noqa: BLE001
        try:
            process.kill()
            process.wait(timeout=timeout_seconds)
        except Exception:  # noqa: BLE001
            return


def run_cdp_diagnosis() -> int:
    print("开始执行 Codex CDP 注入诊断...")
    append_log("CDP diagnosis started.")

    running = running_desktop_codex_processes()
    if running:
        append_log(
            "CDP diagnosis detected running desktop process; continuing with isolated probe. "
            f"process_ids={[process['process_id'] for process in running]}"
        )
        print(
            "检测到 Codex 当前已经在运行，诊断将继续使用隔离用户目录和独立端口做探测。\n"
            "这一步不会修改你的现有配置；如果官方桌面包本身限制了注入，这里会直接给出更明确结论。"
        )

    debug_port = choose_available_port(DIAG_DEBUG_PORT, "CDP diagnosis")
    temp_dir = pathlib.Path(os.environ.get("TEMP", str(pathlib.Path.home()))) / "codex-pro-cdp-diagnosis"
    temp_dir.mkdir(parents=True, exist_ok=True)
    user_data_dir = temp_dir / f"run-{int(time.time())}"
    user_data_dir.mkdir(parents=True, exist_ok=True)
    executable = codex_executable()

    codex = None
    try:
        append_log(f"CDP diagnosis using temporary user data dir: {user_data_dir}")
        try:
            codex = start_codex(debug_port, extra_args=[f"--user-data-dir={user_data_dir}"])
        except PermissionError as error:
            append_log(
                "CDP diagnosis could not launch Codex with debug arguments because Windows denied direct app launch. "
                f"executable={executable} error={error}"
            )
            save_diagnosis_state(
                "unsupported",
                executable,
                "隔离诊断确认：当前 Codex Desktop 是 WindowsApps 包，系统不允许通过调试参数直接启动，启动器会降级到兼容模式。",
            )
            print(
                "诊断结果：当前 Codex Desktop 是 WindowsApps 包，系统拒绝通过调试参数直接启动。\n"
                "这通常不是你操作错了，而是这类安装方式不适合做页面注入。\n"
                "Codex Pro 会继续以兼容模式保护历史：快照、历史修复、索引重建、SQLite 可见性修复仍然可用。\n"
                "限制：原生侧栏里的“历史”入口、删除按钮、导出按钮、Timeline 暂时不会显示。\n"
                "下一步建议：继续正常打开 Codex；需要修复历史时使用桌面 Codex Pro.cmd 或开始菜单 Codex Pro 维护入口。",
                file=sys.stderr,
            )
            print(f"原始错误: {error}", file=sys.stderr)
            print(f"详细日志: {log_path()}", file=sys.stderr)
            return 2
        try:
            targets = wait_for_cdp(debug_port, timeout_seconds=12)
        except Exception as error:  # noqa: BLE001
            append_log(
                "CDP diagnosis failed to observe remote debugging port. "
                f"pid={codex.pid if codex is not None else 'unknown'} port={debug_port}"
            )
            save_diagnosis_state(
                "unsupported",
                executable,
                "隔离诊断确认：当前这版 Codex Desktop 没有暴露调试端口，启动器应直接降级到非注入模式。",
            )
            print(
                "诊断结果：当前这版 Codex Desktop 没有在隔离启动下暴露调试端口。\n"
                "这通常不是你启动方式不对，而是官方正式桌面包本身限制了注入链。\n"
                "这通常意味着官方桌面包限制了 CDP 注入，所以原生侧栏里的修复入口和删除按钮暂时无法显示。\n"
                "这组增强能力的自动守护、快照、修复历史、重建索引、删除撤销仍然可以继续使用。\n"
                "下一步建议：继续像平常一样打开 Codex；如果历史没显示完整，先点修复历史。要排查注入限制，再把这段诊断结果和 launcher.log 一起反馈。",
                file=sys.stderr,
            )
            print(f"原始错误: {error}", file=sys.stderr)
            print(f"详细日志: {log_path()}", file=sys.stderr)
            return 2

        target_count = len(targets)
        append_log(
            "CDP diagnosis succeeded. "
            f"pid={codex.pid if codex is not None else 'unknown'} port={debug_port} targets={target_count}"
        )
        save_diagnosis_state(
            "supported",
            executable,
            "隔离诊断确认：当前这版 Codex Desktop 可以暴露调试端口，支持增强启动器注入。",
        )
        print(
            "诊断结果：调试端口可用，当前机器上的 Codex Desktop 支持自动附着并完成注入。\n"
            f"CDP 端口: {debug_port}\n"
            f"Target 数量: {target_count}\n"
            "如果你平时仍看不到按钮，优先检查当前机器上的自动附着链路和注入权限。",
        )
        print(f"详细日志: {log_path()}")
        return 0
    finally:
        terminate_process(codex)
        try:
            shutil.rmtree(user_data_dir, ignore_errors=True)
        except Exception:  # noqa: BLE001
            pass


def main() -> int:
    ensure_console_utf8()
    if "--diagnose-cdp" in sys.argv[1:]:
        return run_cdp_diagnosis()

    launch_lock = acquire_launch_lock()
    if launch_lock is None:
        print(
            "Codex Pro 已经有一个启动流程在进行。请继续使用当前 Codex 窗口；如果没有看到窗口，稍后再从桌面 Codex 打开一次。"
        )
        return 0

    try:
        return run_launcher_main()
    finally:
        release_launch_lock(launch_lock)


def run_launcher_main() -> int:
    print("正在准备 Codex Pro 自动附着...")
    append_log("Launcher started.")
    preferred_debug_port = configured_port(ENV_DEBUG_PORT, DEFAULT_DEBUG_PORT)
    preferred_bridge_port = configured_port(ENV_BRIDGE_PORT, DEFAULT_BRIDGE_PORT)
    bridge_token = str(os.environ.get(ENV_BRIDGE_TOKEN, "") or uuid.uuid4().hex).strip()
    existing_targets = cdp_targets_if_running(preferred_debug_port)
    executable = codex_executable()
    if existing_targets is None:
        cached = get_cached_diagnosis_for(executable)
        if isinstance(cached, dict) and cached.get("status") == "unsupported":
            message = str(cached.get("message", "") or "当前桌面包不支持注入。")
            saved_at = str(cached.get("saved_at", "") or "未知时间")
            append_log("Skipping injection attempt because cached diagnosis says current build is unsupported.")
            reason = (
                f"最近诊断时间: {saved_at}\n"
                f"诊断结论: {message}\n"
                "如需重新验证注入支持，请先完全退出 Codex 后运行：\n"
                "py launcher-python\\launcher.py --diagnose-cdp"
            )
            return run_compatibility_mode(reason)
    debug_port = preferred_debug_port if existing_targets is not None else choose_available_port(preferred_debug_port, "CDP")
    bridge_port = choose_available_port(preferred_bridge_port, "bridge")
    bridge = start_bridge(bridge_port, bridge_token)
    try:
        codex = None
        if existing_targets is None:
            ensure_desktop_codex_not_running_without_cdp(debug_port)
            codex = start_codex(debug_port)
            try:
                targets = wait_for_cdp(debug_port)
            except Exception as error:  # noqa: BLE001
                raise_cdp_launch_failure(codex, debug_port, error)
        else:
            append_log("Reusing already-running Codex instance on default CDP port.")
            targets = existing_targets
        inject_ui(targets, bridge_port, bridge_token)
        verify_bridge(bridge_port, bridge_token)
        status_payload = call_bridge_http(bridge_port, "/status", {}, bridge_token)
        print_history_health(summarize_history_health(status_payload))
        print(f"Bridge PID: {bridge.pid}")
        print(f"Codex PID: {codex.pid if codex is not None else '(already running)'}")
        print(f"CDP Port: {debug_port}")
        print(f"Bridge Port: {bridge_port}")
        print(f"启动日志: {log_path()}")
        append_log(
            f"Launcher finished successfully. bridge={bridge.pid} codex={codex.pid if codex is not None else 'already-running'} cdp_port={debug_port} bridge_port={bridge_port}"
        )
        return 0
    except CompatibilityModeRequired as error:
        append_log(f"Launcher switched to compatibility mode: {error}")
        terminate_process(bridge)
        return run_compatibility_mode(str(error))
    except PermissionError as error:
        executable = codex_executable()
        append_log(
            "Launcher could not start Codex with debug arguments because Windows denied direct app launch. "
            f"executable={executable} error={error}"
        )
        save_diagnosis_state(
            "unsupported",
            executable,
            "当前 Codex Desktop 是 WindowsApps 包，系统不允许通过调试参数直接启动；已切换到兼容模式继续保护历史。",
        )
        terminate_process(bridge)
        return run_compatibility_mode(
            "当前 Codex Desktop 是 WindowsApps 包，这次先按兼容方式继续使用。"
        )
    except Exception as error:  # noqa: BLE001
        append_log(f"Launcher failed: {error}")
        print(str(error), file=sys.stderr)
        print(f"详细日志: {log_path()}", file=sys.stderr)
        terminate_process(bridge)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
