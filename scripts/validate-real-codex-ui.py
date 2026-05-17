from __future__ import annotations

import argparse
import base64
import json
import os
import pathlib
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import time
import uuid
from typing import Any


REPO_ROOT = pathlib.Path(__file__).resolve().parent.parent
LAUNCHER_DIR = REPO_ROOT / "launcher-python"
if str(LAUNCHER_DIR) not in sys.path:
    sys.path.insert(0, str(LAUNCHER_DIR))

import launcher  # noqa: E402
import websocket  # noqa: E402


ARTIFACT_DIR = REPO_ROOT / "artifacts" / "real-codex"
REAL_UI_SCREENSHOT_NAMES = [
    "real-codex-hover-delete-visible.png",
    "real-codex-repair-entry-open-panel.png",
    "real-codex-repair-entry-after-open-click.png",
]
COMPATIBILITY_NOTE_NAME = "compatibility-note.txt"
PROFILE_SOURCE = pathlib.Path.home() / r"AppData\Local\Packages\OpenAI.Codex_2p2nqsd0c76g0\LocalCache\Roaming\Codex"
PROFILE_IGNORE = shutil.ignore_patterns(
    "lockfile",
    "LOCK",
    "*.log",
    "Cookies",
    "Cookies-journal",
    "Cache",
    "Cache_Data",
    "GPUCache",
    "Code Cache",
    "Crashpad",
    "DawnGraphiteCache",
    "DawnWebGPUCache",
    "sentry",
    "blob_storage",
)


def send(
    ws: websocket.WebSocket,
    message_id: int,
    method: str,
    params: dict | None = None,
    timeout: int = 60,
) -> dict:
    ws.send(json.dumps({
        "id": message_id,
        "method": method,
        "params": params or {},
    }))
    deadline = time.time() + timeout
    while time.time() < deadline:
        message = json.loads(ws.recv())
        if message.get("id") == message_id:
            return message
    raise RuntimeError(f"Timed out waiting for CDP response {message_id}.")


def value_from_result(result: dict) -> str:
    return str(result.get("result", {}).get("result", {}).get("value", ""))


def write_screenshot(name: str, raw_base64: str) -> pathlib.Path:
    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    path = ARTIFACT_DIR / name
    path.write_bytes(base64.b64decode(raw_base64))
    return path


def write_summary(payload: dict) -> pathlib.Path:
    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    summary_path = ARTIFACT_DIR / "validation-summary.json"
    summary_path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return summary_path


def reset_real_ui_artifacts() -> None:
    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    for path in ARTIFACT_DIR.glob("real-codex*.png"):
        path.unlink()
    note_path = ARTIFACT_DIR / COMPATIBILITY_NOTE_NAME
    if note_path.exists():
        note_path.unlink()


def write_compatibility_note(summary: dict[str, Any]) -> pathlib.Path:
    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    note_path = ARTIFACT_DIR / COMPATIBILITY_NOTE_NAME
    lines = [
        "这次真实 Codex 页面验证进入了兼容模式，因此没有采集新的注入页面截图。",
        f"mode: {summary.get('mode', 'unknown')}",
        f"launchPath: {summary.get('launchPath', 'unknown')}",
        f"failedStage: {summary.get('failedStage', 'unknown')}",
        f"fallbackReason: {summary.get('fallbackReason', 'unknown')}",
        "",
        "兼容模式下的可信产物是 validation-summary.json，而不是旧版注入截图。",
        "如果想拿到新的注入页面截图，请在支持调试端口注入的环境里重新运行 validate-real-codex-ui.py。",
    ]
    note_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return note_path


def ensure_profile_copy(target_dir: pathlib.Path) -> None:
    if not PROFILE_SOURCE.exists():
        raise FileNotFoundError(
            "未找到本机 Codex 桌面 profile，无法做真实页面验证："
            f" {PROFILE_SOURCE}"
        )
    shutil.copytree(PROFILE_SOURCE, target_dir, dirs_exist_ok=True, ignore=PROFILE_IGNORE)


def create_validation_codex_home(codex_home: pathlib.Path) -> None:
    (codex_home / "sessions" / "2026" / "05" / "08").mkdir(parents=True, exist_ok=True)
    (codex_home / "archived_sessions").mkdir(parents=True, exist_ok=True)
    (codex_home / "config.toml").write_text('model_provider = "cliproxyapi"\n', encoding="utf-8")

    state = {
        "electron-saved-workspace-roots": [
            r"C:\Users\Example\Projects\homework",
            r"C:\Users\Example\Projects\workspace",
        ],
        "project-order": [
            r"C:\Users\Example\Projects\homework",
            r"C:\Users\Example\Projects\workspace",
        ],
        "active-workspace-roots": [
            r"C:\Users\Example\Projects\homework",
        ],
    }
    state_text = json.dumps(state, ensure_ascii=False, indent=2) + "\n"
    (codex_home / ".codex-global-state.json").write_text(state_text, encoding="utf-8")
    (codex_home / ".codex-global-state.json.bak").write_text(state_text, encoding="utf-8")

    rollout = codex_home / "sessions" / "2026" / "05" / "08" / "repair-case.jsonl"
    rollout.write_text(
        "\n".join([
            json.dumps({
                "timestamp": "2026-05-08T10:00:00.000Z",
                "type": "session_meta",
                "payload": {
                    "id": "repair-case",
                    "timestamp": "2026-05-08T10:00:00.000Z",
                    "cwd": r"C:\Users\Example\Projects\homework",
                    "source": "cli",
                    "cli_version": "0.115.0",
                    "model_provider": "cliproxyapi",
                },
            }, ensure_ascii=False),
            json.dumps({
                "timestamp": "2026-05-08T10:01:00.000Z",
                "type": "event_msg",
                "payload": {
                    "type": "thread_name_updated",
                    "thread_id": "repair-case",
                    "thread_name": "侧栏修复验证",
                },
            }, ensure_ascii=False),
            json.dumps({
                "timestamp": "2026-05-08T10:02:00.000Z",
                "type": "event_msg",
                "payload": {
                    "type": "user_message",
                    "message": "hello",
                },
            }, ensure_ascii=False),
        ]) + "\n",
        encoding="utf-8",
    )

    (codex_home / "session_index.jsonl").write_text(
        json.dumps({
            "id": "repair-case",
            "thread_name": "侧栏修复验证",
            "updated_at": "2026-05-08T10:01:00.000Z",
        }, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )

    db = sqlite3.connect(codex_home / "state_5.sqlite")
    try:
        db.executescript("""
        CREATE TABLE threads (
          id TEXT PRIMARY KEY,
          rollout_path TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          source TEXT NOT NULL,
          model_provider TEXT NOT NULL,
          cwd TEXT NOT NULL,
          title TEXT NOT NULL,
          sandbox_policy TEXT NOT NULL,
          approval_mode TEXT NOT NULL,
          tokens_used INTEGER NOT NULL DEFAULT 0,
          has_user_event INTEGER NOT NULL DEFAULT 1,
          archived INTEGER NOT NULL DEFAULT 0,
          first_user_message TEXT NOT NULL DEFAULT ''
        );
        """)
        db.execute(
            """
            INSERT INTO threads (
              id, rollout_path, created_at, updated_at, source, model_provider, cwd, title,
              sandbox_policy, approval_mode, tokens_used, has_user_event, archived, first_user_message
            ) VALUES (?, ?, 1, 2, ?, ?, ?, ?, ?, ?, 0, 1, 0, ?)
            """,
            (
                "repair-case",
                str(rollout),
                "cli",
                "cliproxyapi",
                r"C:\Users\Example\Projects\homework",
                "侧栏修复验证",
                "workspace-write",
                "never",
                "hello",
            ),
        )
        db.commit()
    finally:
        db.close()


def run_powershell(script: str, parameters: dict[str, str] | None = None, env: dict[str, str] | None = None) -> str:
    parameter_json = json.dumps(parameters or {}, ensure_ascii=False)
    args = [
        "pwsh",
        "-NoProfile",
        "-Command",
        "\n".join([
            "$__chgParams = ConvertFrom-Json @'",
            parameter_json,
            "'@ -AsHashtable",
            f"& {{ {script} }} @__chgParams",
        ]),
    ]
    result = subprocess.run(
        args,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        cwd=REPO_ROOT,
        env=env,
        check=False,
        timeout=40,
    )
    if result.returncode != 0:
        details = result.stderr.strip() or result.stdout.strip() or "unknown PowerShell failure"
        raise RuntimeError(details)
    return result.stdout.strip()


def create_shortcut(
    shortcut_path: pathlib.Path,
    target_path: str,
    arguments_text: str = "",
    working_directory: str = "",
    icon_location: str = "",
    description: str = "",
) -> None:
    run_powershell(
        "\n".join([
            "param([string]$ShortcutPath,[string]$TargetPath,[string]$ArgumentsText,[string]$WorkingDirectory,[string]$IconLocation,[string]$Description)",
            "$shell = New-Object -ComObject WScript.Shell",
            "$shortcut = $shell.CreateShortcut($ShortcutPath)",
            "$shortcut.TargetPath = $TargetPath",
            "$shortcut.Arguments = $ArgumentsText",
            "$shortcut.WorkingDirectory = $WorkingDirectory",
            "$shortcut.IconLocation = $IconLocation",
            "$shortcut.Description = $Description",
            "$shortcut.Save()",
        ]),
        {
            "ShortcutPath": str(shortcut_path),
            "TargetPath": target_path,
            "ArgumentsText": arguments_text,
            "WorkingDirectory": working_directory,
            "IconLocation": icon_location,
            "Description": description,
        },
    )


def read_shortcut(shortcut_path: pathlib.Path) -> dict[str, Any]:
    output = run_powershell(
        "\n".join([
            "param([string]$ShortcutPath)",
            "$shell = New-Object -ComObject WScript.Shell",
            "$shortcut = $shell.CreateShortcut($ShortcutPath)",
            "[pscustomobject]@{",
            "  TargetPath = $shortcut.TargetPath",
            "  Arguments = $shortcut.Arguments",
            "  WorkingDirectory = $shortcut.WorkingDirectory",
            "  IconLocation = $shortcut.IconLocation",
            "  Description = $shortcut.Description",
            "} | ConvertTo-Json -Compress",
        ]),
        {"ShortcutPath": str(shortcut_path)},
    )
    return json.loads(output or "{}")


def launch_shortcut(shortcut_path: pathlib.Path, env: dict[str, str]) -> None:
    run_powershell(
        "\n".join([
            "param([string]$ShortcutPath)",
            "Start-Process -FilePath $ShortcutPath",
        ]),
        {"ShortcutPath": str(shortcut_path)},
        env=env,
    )


def launch_shortcut_target(shortcut: dict[str, Any], env: dict[str, str]) -> None:
    target_path = str(shortcut.get("TargetPath", "")).strip()
    arguments_text = str(shortcut.get("Arguments", "")).strip()
    if not target_path:
        raise RuntimeError("被接管的快捷方式缺少 TargetPath，无法启动自动附着链。")
    arguments: list[str] = []
    if arguments_text:
        if arguments_text.startswith('"') and arguments_text.endswith('"'):
            arguments.append(arguments_text[1:-1])
        else:
            arguments.append(arguments_text)
    subprocess.Popen(
        [target_path, *arguments],
        cwd=REPO_ROOT,
        env=env,
        creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
    )


def launch_takeover_ps1(launcher_ps1_path: pathlib.Path, env: dict[str, str]) -> None:
    subprocess.Popen(
        [
            "pwsh",
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            str(launcher_ps1_path),
        ],
        cwd=REPO_ROOT,
        env=env,
        creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
    )


def stop_processes_by_patterns(patterns: list[str]) -> None:
    joined = "\n".join(pattern for pattern in patterns if pattern)
    if not joined:
        return
    try:
        run_powershell(
            "\n".join([
                "param([string]$JoinedPatterns)",
                "$patterns = $JoinedPatterns -split \"`n\" | Where-Object { $_ }",
                "$matches = Get-CimInstance Win32_Process | Where-Object {",
                "  $commandLine = [string]($_.CommandLine)",
                "  foreach ($pattern in $patterns) {",
                "    if ($commandLine.IndexOf($pattern, [System.StringComparison]::OrdinalIgnoreCase) -ge 0) {",
                "      return $true",
                "    }",
                "  }",
                "  return $false",
                "}",
                "foreach ($process in $matches) {",
                "  Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue",
                "}",
            ]),
            {"JoinedPatterns": joined},
        )
    except Exception:
        return


def ensure_takeover_entry(
    desktop_dir: pathlib.Path,
    programs_root: pathlib.Path,
    env: dict[str, str],
) -> dict[str, Any]:
    desktop_dir.mkdir(parents=True, exist_ok=True)
    programs_root.mkdir(parents=True, exist_ok=True)
    executable = launcher.codex_executable()

    desktop_shortcut = desktop_dir / "Codex.lnk"
    start_menu_shortcut = programs_root / "Codex.lnk"
    icon_location = f"{executable},0"

    create_shortcut(
        desktop_shortcut,
        executable,
        working_directory=str(pathlib.Path(executable).parent),
        icon_location=icon_location,
        description="Codex",
    )
    create_shortcut(
        start_menu_shortcut,
        executable,
        working_directory=str(pathlib.Path(executable).parent),
        icon_location=icon_location,
        description="Codex",
    )

    subprocess.run(
        [
            "node",
            str(REPO_ROOT / "src" / "cli.js"),
            "codex-pro",
            "takeover-install",
            "--desktop-path",
            str(desktop_dir),
            "--start-menu-path",
            str(programs_root),
        ],
        cwd=REPO_ROOT,
        env=env,
        check=True,
    )

    managed_desktop = read_shortcut(desktop_shortcut)
    managed_start_menu = read_shortcut(start_menu_shortcut)
    desktop_taken_over = pathlib.Path(str(managed_desktop.get("TargetPath", "")).lower()).name == "wscript.exe" and "takeover-launch.vbs" in str(managed_desktop.get("Arguments", "")).lower()
    start_menu_taken_over = pathlib.Path(str(managed_start_menu.get("TargetPath", "")).lower()).name == "wscript.exe" and "takeover-launch.vbs" in str(managed_start_menu.get("Arguments", "")).lower()

    if not desktop_taken_over:
        raise RuntimeError("桌面 Codex 快捷方式没有被成功接管。")
    if not start_menu_taken_over:
        raise RuntimeError("开始菜单 Codex 快捷方式没有被成功接管。")

    return {
        "desktopShortcutPath": str(desktop_shortcut),
        "startMenuShortcutPath": str(start_menu_shortcut),
        "desktopShortcut": managed_desktop,
        "startMenuShortcut": managed_start_menu,
        "desktopTakenOver": desktop_taken_over,
        "startMenuTakenOver": start_menu_taken_over,
        "launcherPs1Path": str(pathlib.Path(env[launcher.ENV_GUARD_APP_DIR]) / "takeover-launch.ps1"),
        "launcherCmdPath": str(pathlib.Path(env[launcher.ENV_GUARD_APP_DIR]) / "takeover-launch.cmd"),
        "launcherVbsPath": str(pathlib.Path(env[launcher.ENV_GUARD_APP_DIR]) / "takeover-launch.vbs"),
    }


def remove_takeover(env: dict[str, str]) -> None:
    subprocess.run(
        [
            "node",
            str(REPO_ROOT / "src" / "cli.js"),
            "codex-pro",
            "takeover-remove",
        ],
        cwd=REPO_ROOT,
        env=env,
        check=False,
    )


def configure_takeover_launcher_ps1(launcher_ps1_path: pathlib.Path, env: dict[str, str]) -> None:
    lines = [
        "$ErrorActionPreference = 'Stop'",
    ]
    for key in [
        "CODEX_HOME",
        launcher.ENV_GUARD_APP_DIR,
        launcher.ENV_DEBUG_PORT,
        launcher.ENV_BRIDGE_PORT,
        launcher.ENV_USER_DATA_DIR,
        "CODEX_PRO_DESKTOP_PATH",
        "CODEX_PRO_START_MENU_PATH",
    ]:
        value = str(env.get(key, ""))
        if value:
            escaped = value.replace("'", "''")
            lines.append(f"$env:{key} = '{escaped}'")
    lines.append(f'py "{REPO_ROOT / "launcher-python" / "launcher.py"}"')
    lines.append("exit $LASTEXITCODE")
    launcher_ps1_path.write_text("\r\n".join(lines) + "\r\n", encoding="utf-8")


def read_launcher_log_state(guard_app_dir: pathlib.Path) -> dict[str, Any]:
    log_file = guard_app_dir / launcher.LOG_FILE_NAME
    if not log_file.exists():
        return {
            "launcherStarted": False,
            "launcherLogPath": str(log_file),
            "launcherLogExcerpt": "",
            "launcherCompatibilityReady": False,
            "launcherCompatibilityReason": "",
        }
    text = log_file.read_text(encoding="utf-8", errors="replace").strip()
    excerpt = "\n".join(text.splitlines()[-8:]) if text else ""
    compatibility_reason = ""
    for line in text.splitlines():
        if "Launcher switched to compatibility mode:" in line:
            compatibility_reason = line.split("Launcher switched to compatibility mode:", 1)[1].strip()
    compatibility_ready = (
        "Launcher switched to compatibility mode:" in text
        or "Compatibility mode activated while Codex is already running." in text
        or "Compatibility mode launched native Codex process" in text
        or "Skipping injection attempt because cached diagnosis says current build is unsupported." in text
    )
    return {
        "launcherStarted": bool(text),
        "launcherLogPath": str(log_file),
        "launcherLogExcerpt": excerpt,
        "launcherCompatibilityReady": compatibility_ready,
        "launcherCompatibilityReason": compatibility_reason,
    }


def wait_for_takeover_signal(guard_app_dir: pathlib.Path, timeout_seconds: int = 20) -> dict[str, Any]:
    deadline = time.time() + timeout_seconds
    while time.time() < deadline:
        state = read_launcher_log_state(guard_app_dir)
        if state["launcherStarted"]:
            return state
        time.sleep(0.5)
    raise RuntimeError("被接管的 Codex 入口没有拉起自动附着链。")


def wait_for_takeover_outcome(
    guard_app_dir: pathlib.Path,
    bridge_port: int,
    bridge_token: str,
    timeout_seconds: int = 40,
) -> dict[str, Any]:
    deadline = time.time() + timeout_seconds
    last_error: Exception | None = None
    while time.time() < deadline:
        state = read_launcher_log_state(guard_app_dir)
        if state["launcherCompatibilityReady"]:
            state["outcome"] = "compatibility"
            return state
        try:
            launcher.verify_bridge(bridge_port, bridge_token)
            state["outcome"] = "bridge_ready"
            return state
        except Exception as error:  # noqa: BLE001
            last_error = error
        time.sleep(0.5)
    state = read_launcher_log_state(guard_app_dir)
    state["outcome"] = "timeout"
    state["launcherLastError"] = str(last_error) if last_error is not None else ""
    return state


def wait_for_page_ready(ws: websocket.WebSocket) -> None:
    for _ in range(40):
        result = send(ws, 2, "Runtime.evaluate", {
            "expression": "JSON.stringify({ready: document.readyState, hasBody: !!document.body, text: (document.body?.innerText || '').slice(0, 80)})",
            "returnByValue": True,
            "awaitPromise": False,
        })
        payload = json.loads(value_from_result(result))
        if payload["ready"] == "complete" and payload["hasBody"] and payload["text"].strip():
            return
        time.sleep(1)
    raise RuntimeError("真实 Codex 页面在预期时间内没有稳定加载。")


def wait_for_bridge_ready(bridge_port: int, bridge_token: str, timeout_seconds: int = 40) -> None:
    deadline = time.time() + timeout_seconds
    last_error: Exception | None = None
    while time.time() < deadline:
        try:
            launcher.verify_bridge(bridge_port, bridge_token)
            return
        except Exception as error:  # noqa: BLE001
            last_error = error
            time.sleep(0.5)
    raise RuntimeError(f"本地 history bridge 没有按时启动：{last_error}")


def connect_page_socket(debug_port: int) -> tuple[websocket.WebSocket, dict[str, Any]]:
    targets = launcher.wait_for_cdp(debug_port, timeout_seconds=40)
    target = launcher.pick_page_target(targets)
    ws = websocket.create_connection(target["webSocketDebuggerUrl"], timeout=40)
    send(ws, 1, "Page.enable")
    wait_for_page_ready(ws)
    return ws, target


def install_debug_injection(control_ws: websocket.WebSocket, bridge_port: int, bridge_token: str) -> None:
    send(control_ws, 3, "Runtime.addBinding", {"name": launcher.BRIDGE_BINDING_NAME})
    launcher.evaluate_script(control_ws, launcher.build_bridge_script(launcher.BRIDGE_BINDING_NAME), 4)
    script = (REPO_ROOT / "inject-ui" / "history-guard-ui.js").read_text(encoding="utf-8")
    prefix = (
        f"window.__CODEX_PRO_HELPER__ = 'http://127.0.0.1:{bridge_port}';\n"
        f"window.__CODEX_HISTORY_GUARD_HELPER__ = window.__CODEX_PRO_HELPER__;\n"
        f"window.__CODEX_PRO_BRIDGE_TOKEN__ = {json.dumps(bridge_token)};\n"
        f"window.__CODEX_HISTORY_GUARD_BRIDGE_TOKEN__ = window.__CODEX_PRO_BRIDGE_TOKEN__;\n"
    )
    launcher.evaluate_script(control_ws, prefix + script, 5)
    launcher.start_bridge_loop(control_ws, bridge_port, bridge_token)


def wait_for_history_entry(ws: websocket.WebSocket, timeout_seconds: int = 18) -> None:
    deadline = time.time() + timeout_seconds
    while time.time() < deadline:
        result = send(ws, 30, "Runtime.evaluate", {
            "expression": """
JSON.stringify({
  launcher: !!document.querySelector('#codex-history-guard-launcher'),
  repair: !!document.querySelector('#codex-history-guard-sidebar-repair')
})
""",
            "returnByValue": True,
            "awaitPromise": False,
        })
        payload = json.loads(value_from_result(result))
        if payload.get("launcher"):
            return
        time.sleep(0.6)
    raise RuntimeError("真实页面里没有出现“历史”入口。")


def inspect_real_ui(debug_port: int) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any], dict[str, Any], dict[str, str]]:
    inspect_ws: websocket.WebSocket | None = None
    try:
        inspect_ws, _target = connect_page_socket(debug_port)
        wait_for_history_entry(inspect_ws)

        delete_summary = json.loads(value_from_result(send(inspect_ws, 11, "Runtime.evaluate", {
            "expression": """
JSON.stringify({
  launcher: !!document.querySelector('#codex-history-guard-launcher'),
  launcherMode: document.querySelector('#codex-history-guard-launcher')?.dataset?.chgTriggerMode || null,
  candidateRows: document.querySelectorAll('[data-app-action-sidebar-thread-id], [data-thread-title], a[href*="/thread/"], a[href*="/conversation/"], a[href*="/session/"]').length,
  deleteButtons: document.querySelectorAll('.chg-row-delete').length
})
""",
            "returnByValue": True,
            "awaitPromise": False,
        })))

        coords = json.loads(value_from_result(send(inspect_ws, 13, "Runtime.evaluate", {
            "expression": """
JSON.stringify((() => {
  const row = document.querySelector('[data-app-action-sidebar-thread-id], [data-thread-title], a[href*="/thread/"], a[href*="/conversation/"], a[href*="/session/"]')
    ?.closest('[data-app-action-sidebar-thread-id], [data-session-id], a, button, [role="button"], li, [data-testid], div');
  if (!row) return null;
  const rect = row.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
})())
""",
            "returnByValue": True,
            "awaitPromise": False,
        })))
        if coords:
            send(inspect_ws, 14, "Input.dispatchMouseEvent", {
                "type": "mouseMoved",
                "x": coords["x"],
                "y": coords["y"],
            })
            time.sleep(1.2)

        hover_summary = json.loads(value_from_result(send(inspect_ws, 15, "Runtime.evaluate", {
            "expression": """
JSON.stringify({
  visibleDeleteButtons: Array.from(document.querySelectorAll('.chg-row-delete')).filter((button) => {
    const style = getComputedStyle(button);
    return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || '0') > 0.1;
  }).length
})
""",
            "returnByValue": True,
            "awaitPromise": False,
        })))
        delete_screenshot = write_screenshot(
            "real-codex-hover-delete-visible.png",
            send(inspect_ws, 16, "Page.captureScreenshot", {"format": "png"}).get("result", {}).get("data", ""),
        )

        send(inspect_ws, 17, "Runtime.evaluate", {
            "expression": "document.querySelector('#codex-history-guard-launcher')?.click()",
            "returnByValue": True,
            "awaitPromise": False,
        })
        time.sleep(1.5)

        repair_before = json.loads(value_from_result(send(inspect_ws, 18, "Runtime.evaluate", {
            "expression": """
JSON.stringify({
  repairHidden: document.querySelector('#codex-history-guard-sidebar-repair')?.hidden ?? null,
  roots: document.querySelector('[data-field="roots"]')?.textContent || '',
  result: document.querySelector('#codex-history-guard-result')?.textContent || ''
})
""",
            "returnByValue": True,
            "awaitPromise": False,
        })))
        repair_before_screenshot = write_screenshot(
            "real-codex-repair-entry-open-panel.png",
            send(inspect_ws, 19, "Page.captureScreenshot", {"format": "png"}).get("result", {}).get("data", ""),
        )

        send(inspect_ws, 20, "Runtime.evaluate", {
            "expression": "document.querySelector('#codex-history-guard-sidebar-repair .chg-sidebar-repair-btn')?.click()",
            "returnByValue": True,
            "awaitPromise": False,
        })
        time.sleep(3)

        repair_after = json.loads(value_from_result(send(inspect_ws, 21, "Runtime.evaluate", {
            "expression": """
JSON.stringify({
  repairHidden: document.querySelector('#codex-history-guard-sidebar-repair')?.hidden ?? null,
  roots: document.querySelector('[data-field="roots"]')?.textContent || '',
  result: document.querySelector('#codex-history-guard-result')?.textContent || ''
})
""",
            "returnByValue": True,
            "awaitPromise": False,
        })))
        repair_after_screenshot = write_screenshot(
            "real-codex-repair-entry-after-open-click.png",
            send(inspect_ws, 22, "Page.captureScreenshot", {"format": "png"}).get("result", {}).get("data", ""),
        )

        if not delete_summary.get("launcher"):
            raise RuntimeError("真实页面里没有出现“历史”入口。")
        if delete_summary.get("launcherMode") != "native":
            raise RuntimeError("真实页面入口没有挂到原生头部区域。")
        if int(delete_summary.get("deleteButtons", 0)) <= 0:
            raise RuntimeError("真实侧栏里没有挂上删除按钮。")
        if int(hover_summary.get("visibleDeleteButtons", 0)) <= 0:
            raise RuntimeError("悬停后没有看到可见的删除按钮。")
        if repair_before.get("repairHidden") is not False:
            raise RuntimeError("真实异常状态下，修复入口没有显示出来。")
        if "1 / 2" not in str(repair_before.get("roots", "")):
            raise RuntimeError("修复前没有看到预期的异常工作区状态 1 / 2。")
        if repair_after.get("repairHidden") is not True:
            raise RuntimeError("执行修复后，修复入口没有隐藏。")
        if "2 / 2" not in str(repair_after.get("roots", "")):
            raise RuntimeError("执行修复后，没有看到预期的工作区状态 2 / 2。")

        return (
            delete_summary,
            hover_summary,
            repair_before,
            repair_after,
            {
                "hoverDeleteScreenshot": str(delete_screenshot),
                "repairBeforeScreenshot": str(repair_before_screenshot),
                "repairAfterScreenshot": str(repair_after_screenshot),
            },
        )
    finally:
        try:
            if inspect_ws is not None:
                inspect_ws.close()
        except Exception:
            pass


def start_manual_bridge(bridge_port: int, codex_home: pathlib.Path, env: dict[str, str]) -> subprocess.Popen:
    return subprocess.Popen(
        [
            "node",
            str(REPO_ROOT / "src" / "cli.js"),
            "codex-pro",
            "bridge",
            "--port",
            str(bridge_port),
            "--codex-home",
            str(codex_home),
        ],
        cwd=REPO_ROOT,
        env=env,
    )


def build_validation_env(
    work_root: pathlib.Path,
    codex_home: pathlib.Path,
    profile_dir: pathlib.Path,
    desktop_dir: pathlib.Path,
    programs_root: pathlib.Path,
    bridge_port: int,
    debug_port: int,
) -> dict[str, str]:
    env = os.environ.copy()
    env["CODEX_HOME"] = str(codex_home)
    env[launcher.ENV_GUARD_APP_DIR] = str(work_root / ".codex-pro")
    env[launcher.ENV_DEBUG_PORT] = str(debug_port)
    env[launcher.ENV_BRIDGE_PORT] = str(bridge_port)
    env[launcher.ENV_BRIDGE_TOKEN] = uuid.uuid4().hex
    env[launcher.ENV_USER_DATA_DIR] = str(profile_dir)
    env["CODEX_PRO_DESKTOP_PATH"] = str(desktop_dir)
    env["CODEX_PRO_START_MENU_PATH"] = str(programs_root)
    return env


def build_compatibility_summary(
    launch_mode: str,
    launch_entry: str,
    takeover_evidence: dict[str, Any],
    guard_app_dir: pathlib.Path,
    bridge_port: int,
    debug_port: int,
    codex_home: pathlib.Path,
    env: dict[str, str],
    failed_stage: str,
    error: Exception,
) -> dict[str, Any]:
    bridge_process: subprocess.Popen | None = None
    try:
        bridge_token = env.get(launcher.ENV_BRIDGE_TOKEN, "")
        try:
            wait_for_bridge_ready(bridge_port, bridge_token, timeout_seconds=6)
        except Exception:
            bridge_process = start_manual_bridge(bridge_port, codex_home, env)
            wait_for_bridge_ready(bridge_port, bridge_token, timeout_seconds=20)

        status_payload = launcher.call_bridge_http(bridge_port, "/status", {}, bridge_token)
        doctor = status_payload.get("doctor", {})
        recovery = status_payload.get("recoveryPlan", {})
        management = dict(status_payload.get("management", {}))
        management["compatibilityMode"] = True
        ui_mode = str(recovery.get("uiMode", "unknown"))
        if "compatibility" not in ui_mode and "diagnosis_unknown" not in ui_mode:
            raise RuntimeError(
                f"兼容模式校验失败：恢复模式不是兼容降级状态（uiMode={ui_mode}）。"
            ) from error

        return {
            "mode": "takeover_compatibility" if launch_mode == "takeover" else "debug_compatibility",
            "launchPath": launch_mode,
            "launchEntry": launch_entry,
            "triggeredByTakenOverCodex": launch_mode == "takeover",
            "bridgePort": bridge_port,
            "debugPort": debug_port,
            "failedStage": failed_stage,
            "fallbackReason": str(error),
            "takeoverEvidence": {
                **takeover_evidence,
                **read_launcher_log_state(guard_app_dir),
            },
            "doctor": {
                "currentProvider": doctor.get("currentProvider"),
                "rolloutFileCount": doctor.get("rolloutFileCount"),
                "sessionIndexCount": doctor.get("sessionIndexCount"),
                "activeWorkspaceRootCount": doctor.get("activeWorkspaceRootCount"),
                "savedWorkspaceRootCount": doctor.get("savedWorkspaceRootCount"),
            },
            "recoveryPlan": recovery,
            "management": management,
            "takeover": status_payload.get("takeover", {}),
            "artifacts": {
                "capturedScreenshots": [],
            },
        }
    finally:
        launcher.terminate_process(bridge_process)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="验证真实 Codex 页面里的原生化历史入口、删除按钮和修复入口。"
    )
    parser.add_argument(
        "--launch-mode",
        choices=["takeover", "debug"],
        default="takeover",
        help="默认从被接管的原生 Codex 入口验证；debug 只作为开发回退路径。",
    )
    args = parser.parse_args()

    launcher.ensure_console_utf8()
    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    reset_real_ui_artifacts()

    work_root = pathlib.Path(tempfile.gettempdir()) / "codex-pro-real-validation"
    if work_root.exists():
        shutil.rmtree(work_root, ignore_errors=True)
    work_root.mkdir(parents=True, exist_ok=True)

    profile_dir = work_root / "CodexProfile"
    codex_home = work_root / ".codex"
    desktop_dir = work_root / "Desktop"
    programs_root = work_root / "Programs"
    ensure_profile_copy(profile_dir)
    create_validation_codex_home(codex_home)

    bridge_port = launcher.choose_available_port(8905, "bridge")
    debug_port = launcher.choose_available_port(9475, "CDP")
    env = build_validation_env(
        work_root,
        codex_home,
        profile_dir,
        desktop_dir,
        programs_root,
        bridge_port,
        debug_port,
    )
    previous_guard_app_dir = os.environ.get(launcher.ENV_GUARD_APP_DIR)
    os.environ[launcher.ENV_GUARD_APP_DIR] = env[launcher.ENV_GUARD_APP_DIR]

    takeover_evidence: dict[str, Any] = {
        "desktopShortcutPath": None,
        "startMenuShortcutPath": None,
        "desktopTakenOver": False,
        "startMenuTakenOver": False,
    }
    takeover_runtime: dict[str, Any] = {}
    bridge_process: subprocess.Popen | None = None
    codex_process: subprocess.Popen | None = None
    control_ws: websocket.WebSocket | None = None
    stage = "bootstrap"
    launch_entry = "debug_launcher" if args.launch_mode == "debug" else "desktop_codex_shortcut"

    compatibility_stages = {
        "takeover_setup",
        "takeover_launch",
        "wait_for_takeover_outcome",
        "launcher_compatibility_mode",
        "wait_for_bridge",
        "start_codex",
        "wait_for_cdp",
        "connect_control_ws",
        "inject_ui",
        "wait_for_ui",
    }

    try:
        bridge_token = env.get(launcher.ENV_BRIDGE_TOKEN, "")
        if args.launch_mode == "takeover":
            stage = "takeover_setup"
            takeover_evidence = ensure_takeover_entry(desktop_dir, programs_root, env)
            configure_takeover_launcher_ps1(pathlib.Path(takeover_evidence["launcherPs1Path"]), env)
            stage = "takeover_launch"
            launch_shortcut(pathlib.Path(takeover_evidence["desktopShortcutPath"]), env)
            stage = "wait_for_takeover_signal"
            guard_app_dir = pathlib.Path(env[launcher.ENV_GUARD_APP_DIR])
            try:
                takeover_runtime = wait_for_takeover_signal(guard_app_dir, timeout_seconds=12)
            except RuntimeError:
                launch_takeover_ps1(pathlib.Path(takeover_evidence["launcherPs1Path"]), env)
                takeover_runtime = wait_for_takeover_signal(guard_app_dir, timeout_seconds=20)
                takeover_runtime["launchFallback"] = "launcher_ps1"
            stage = "wait_for_takeover_outcome"
            outcome = wait_for_takeover_outcome(guard_app_dir, bridge_port, bridge_token)
            takeover_runtime = {
                **takeover_runtime,
                **outcome,
            }
            if outcome.get("outcome") == "compatibility":
                stage = "launcher_compatibility_mode"
                reason = outcome.get("launcherCompatibilityReason") or "启动器已自动切到兼容模式。"
                raise RuntimeError(reason)
            if outcome.get("outcome") != "bridge_ready":
                stage = "wait_for_bridge"
                raise RuntimeError(outcome.get("launcherLastError") or "本地 history bridge 没有按时启动。")
        else:
            stage = "wait_for_bridge"
            bridge_process = start_manual_bridge(bridge_port, codex_home, env)
            wait_for_bridge_ready(bridge_port, bridge_token)
            stage = "start_codex"
            codex_process = launcher.start_codex(debug_port, extra_args=[f"--user-data-dir={profile_dir}"])

        stage = "wait_for_cdp"
        control_ws, _target = connect_page_socket(debug_port)
        if args.launch_mode == "debug":
            stage = "inject_ui"
            install_debug_injection(control_ws, bridge_port, bridge_token)
        time.sleep(4)
        stage = "wait_for_ui"
        wait_for_history_entry(control_ws)

        delete_summary, hover_summary, repair_before, repair_after, artifacts = inspect_real_ui(debug_port)
        status_payload = launcher.call_bridge_http(bridge_port, "/status", {}, bridge_token)
        summary = {
            "mode": "takeover_injection" if args.launch_mode == "takeover" else "debug_injection",
            "launchPath": args.launch_mode,
            "launchEntry": launch_entry,
            "triggeredByTakenOverCodex": args.launch_mode == "takeover",
            "bridgePort": bridge_port,
            "debugPort": debug_port,
            "takeoverEvidence": {
                **takeover_evidence,
                **takeover_runtime,
            },
            "takeover": status_payload.get("takeover", {}),
            "management": status_payload.get("management", {}),
            "recoveryPlan": status_payload.get("recoveryPlan", {}),
            "deleteSummary": delete_summary,
            "hoverSummary": hover_summary,
            "repairBefore": repair_before,
            "repairAfter": repair_after,
            "artifacts": {
                **artifacts,
                "capturedScreenshots": list(artifacts.values()),
            },
        }
        summary_path = write_summary(summary)
        print("Real Codex UI validation passed.")
        print(f"Validation path: {args.launch_mode}")
        print(f"Mode: {summary['mode']}")
        print(f"Delete hover screenshot: {artifacts['hoverDeleteScreenshot']}")
        print(f"Repair before screenshot: {artifacts['repairBeforeScreenshot']}")
        print(f"Repair after screenshot: {artifacts['repairAfterScreenshot']}")
        print(f"Summary: {summary_path}")
        return 0
    except Exception as error:
        if stage not in compatibility_stages:
            raise

        summary = build_compatibility_summary(
            launch_mode=args.launch_mode,
            launch_entry=launch_entry,
            takeover_evidence={
                **takeover_evidence,
                **takeover_runtime,
            },
            guard_app_dir=pathlib.Path(env[launcher.ENV_GUARD_APP_DIR]),
            bridge_port=bridge_port,
            debug_port=debug_port,
            codex_home=codex_home,
            env=env,
            failed_stage=stage,
            error=error,
        )
        note_path = write_compatibility_note(summary)
        summary["artifacts"] = {
            **dict(summary.get("artifacts", {})),
            "capturedScreenshots": [],
            "compatibilityNotePath": str(note_path),
        }
        summary_path = write_summary(summary)
        print("Real Codex UI compatibility validation passed.")
        print(f"Validation path: {args.launch_mode}")
        print(f"Mode: {summary['mode']}")
        print(f"Fallback stage: {stage}")
        print(f"Fallback reason: {error}")
        print(f"Summary: {summary_path}")
        return 0
    finally:
        try:
            if control_ws is not None:
                control_ws.close()
        except Exception:
            pass
        launcher.terminate_process(codex_process)
        launcher.terminate_process(bridge_process)
        stop_processes_by_patterns([
            f"--remote-debugging-port={debug_port}",
            f"--user-data-dir={profile_dir}",
            f"codex-pro bridge --port {bridge_port}",
            f"codex-pro bridge --port={bridge_port}",
        ])
        remove_takeover(env)
        if previous_guard_app_dir is None:
            os.environ.pop(launcher.ENV_GUARD_APP_DIR, None)
        else:
            os.environ[launcher.ENV_GUARD_APP_DIR] = previous_guard_app_dir
        shutil.rmtree(work_root, ignore_errors=True)


if __name__ == "__main__":
    raise SystemExit(main())
