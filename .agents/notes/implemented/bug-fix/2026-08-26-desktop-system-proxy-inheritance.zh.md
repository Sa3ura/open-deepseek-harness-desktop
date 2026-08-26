# Agent Note: 将桌面系统代理传递给受管 Harness 进程

Status: implemented

[English](2026-08-26-desktop-system-proxy-inheritance.md) | 中文

## 问题

Electron 会自动使用操作系统代理，但由桌面端拥有的 Harness 进程及其受管产品 subagent 只继承进程环境变量。因此，用户可以通过系统代理加载桌面 UI，而包内 Codex app-server 仍会尝试直接建立 WebSocket 连接，反复超时后才回退到较慢的传输方式。此时已安装的 Codex 包和原生平台载荷都是健康的，重新安装连接插件无法修复这种网络配置不一致。

## 决策

Electron 就绪后，桌面宿主会让默认 Electron session 解析 ChatGPT Codex 端点。若父进程没有显式设置 `HTTP_PROXY`、`HTTPS_PROXY` 或 `ALL_PROXY`，宿主会把 Chromium 返回的首个受支持 `PROXY`、`HTTPS`、`SOCKS4` 或 `SOCKS5` 路由转换成 Harness 使用的 `HTTP_PROXY` 与 `HTTPS_PROXY`。该环境还会绕过 `127.0.0.1`、`localhost` 和 `::1`，从而保留本地 Harness 通信。Harness 管理的子进程会通过现有凭据清洗逻辑继承这些普通环境项，因此已发布的 Codex 连接插件无需修改源码或用户 Codex 配置，也能取得相同网络路由。

显式代理环境变量始终优先。直接路由、不受支持的代理路由、格式错误的结果或解析失败都会保持进程环境不变。宿主只记录是否启用了系统代理继承，绝不记录解析到的代理地址。

## 曾考虑的替代方案

**修改已发布的 Codex 连接插件。** 桌面端会从 npm 安装官方包，无法替换已经发布的 DeepSeek scope 版本。后续连接插件可以启用 Codex 原生系统代理功能，但这无法修复现有安装。

**把系统代理复制到 `~/.codex/config.toml`。** 这会让桌面端成为原生 Codex 配置的第二责任方，并可能覆盖 Codex CLI 与 Codex 应用共同使用的设置。

**禁用 WebSocket 传输。** HTTPS 回退可以避开反复握手延迟，但会放弃产品首选传输方式，也不能让其他受管网络客户端采用桌面端的网络路由。

## 后果

当 Electron 能够解析系统代理时，macOS、Windows 与 Linux 上的桌面 Codex 委派都会采用该代理，而显式部署代理变量仍保持优先。该环境路由只在当前进程中生效，桌面端退出后即消失。若 PAC 文件针对不同外部目标返回不同代理，传统子进程环境变量只能表达一个代理 URL，因此仍有限制；未来由连接插件原生支持会更加精确。
