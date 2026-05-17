# Python Launcher

`launcher-python/launcher.py` 现在承担的是自动附着和维护入口能力，而不再是普通用户每天都要手动打开的主入口。

它负责：

1. 启动本地 `codex-pro bridge`
2. 通过被接管的原生 `Codex` 入口或维护入口，以 `--remote-debugging-port` 和 `--remote-allow-origins` 参数启动 Codex
3. 等待 Codex CDP 端口就绪并选择可注入页面
4. 通过 `Runtime.addBinding + Runtime.evaluate` 建立渲染层 bridge
5. 注入 `inject-ui/history-guard-ui.js`
6. 把启动过程写入本地日志，便于排障

当前版本已实现：

- 启动 bridge
- 为自动附着链路准备注入能力
- 等待 CDP target 可访问
- 安装 CDP binding bridge
- 注入 Codex Pro 面板
- 验证前端注入标记是否真的出现，避免“看起来启动成功但按钮没挂上去”
- 在 Codex 内调用本地 `status / snapshot / repair-sidebar / rebuild-index / sessions`
- 在 Codex 内调用 `restore-latest / delete-session / undo-delete-session`
- 记录启动日志到 `~/.codex-pro/launcher.log`
- 记录最近一次注入支持诊断到 `~/.codex-pro/cdp-diagnosis.json`
- 启动完成后自动读取 `/status`，把当前历史是否异常直接提示给用户
- 如果已经确认当前官方桌面包不支持调试端口注入，会直接降级提示，避免每次都等待超时
- 降级后不会直接把用户丢回报错，而是进入兼容模式继续保留原生 Codex 的可用性

首发边界：

- 默认发布形态是脚本 + 绿色包，不阻塞在 EXE 安装器上。
- 启动器只负责历史守护相关能力，不扩展成通用 Codex 桌面重构层。

如果你在手动排障时打开维护入口没有反应，优先检查：

```text
%USERPROFILE%\.codex-pro\launcher.log
```

如果你怀疑当前官方桌面包限制了注入链，可以在仓库目录运行：

```powershell
py .\launcher-python\launcher.py --diagnose-cdp
```

这个诊断模式会使用临时用户目录隔离启动，不会改你的 `provider`、`base_url` 或登录方式。
就算原版 Codex 当前还开着，它也会尽量继续做隔离探测，直接告诉你“是启动方式问题”还是“官方桌面包本身不支持注入”。

如果你想继续验证“真实页面里按钮是否真的可见、异常修复是否真的生效”，可以运行：

```powershell
py .\scripts\validate-real-codex-ui.py
```

它默认会从被接管的原生 `Codex` 入口启动真实验证，复制一份当前机器上的 Codex profile 到临时目录，并输出真实截图到：

```text
artifacts/real-codex
```


