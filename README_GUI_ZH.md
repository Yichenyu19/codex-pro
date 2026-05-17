# Codex Pro Windows 使用说明

这份说明面向 Windows 普通用户和维护者。当前产品主线是 `Codex Pro`，日常入口仍然是原生 `Codex`。

`Codex Pro` 是非官方本地增强层，与 OpenAI 无隶属关系；它不修改 Codex 安装包，也不会上传你的本地历史或账号数据。

## 日常怎么打开

安装后继续像平常一样打开：

```text
Codex
```

安装脚本会尽量接管桌面和开始菜单里的原生 `Codex` 入口。接管成功后，用户看到的名称仍然是 `Codex`，增强链会在后台尝试自动附着。

`Codex Pro.cmd` 只作为维护 / 救援入口保留，用于手动修复、诊断、卸载或兼容模式排障。

## 历史不见了怎么处理

固定三步：

1. 修复历史显示
2. 重建历史索引
3. 打开高级修复

如果页面增强可用，这些入口会自然融入 Codex 内部的 `历史` 面板。如果当前桌面包不支持注入，兼容模式仍会继续保留历史守护、快照、修复和索引重建能力。

高级区域还会提供单会话 Markdown 导出、本地交接包、插件入口 / 安装按钮可见性修复、长对话跳转和一键检查 / 安装更新。发现新版本时会先做低噪声提示，普通用户不用先学这些；只有长对话需要留档、重开、交接、插件页控件不可点或需要升级时再打开。

## 开始菜单维护入口

安装后开始菜单会有：

```text
Codex Pro
```

常见维护项：

- `Repair History`
- `Protection Status`
- `Update Codex Pro`
- `Injection Check`
- `History Check`
- `Quick Start`
- `Uninstall`

普通用户优先在 Codex 内操作；这些入口只在手动修复或排障时使用。

## 安全边界

- 不自动修改 `model_provider`
- 不自动修改 `base_url`
- 不自动切换登录方式
- 不重写旧会话里的加密内容（`encrypted_content`）
- 删除能力只做单条删除、删除前快照和撤销

## 日志位置

```text
%USERPROFILE%\.codex-pro\launcher.log
```

如果需要判断当前机器为什么进入兼容模式，普通用户优先打开开始菜单里的 `Injection Check`。只有在维护或深度排障时，再运行：

```powershell
py launcher-python\launcher.py --diagnose-cdp
```


