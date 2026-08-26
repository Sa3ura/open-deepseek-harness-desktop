# Agent Note: Pass the desktop system proxy to managed Harness processes

Status: implemented

English | [中文](2026-08-26-desktop-system-proxy-inheritance.zh.md)

## Problem

Electron uses the operating system proxy automatically, but the desktop-owned Harness process and its managed product subagents inherit only process environment variables. A user can therefore load the desktop UI through the system proxy while the package-local Codex app-server attempts direct WebSocket connections, repeatedly times out, and falls back to a slower transport. The installed Codex package and native platform payload remain healthy, so reinstalling the connector does not correct this network mismatch.

## Decision

After Electron becomes ready, the desktop host asks the default Electron session to resolve the ChatGPT Codex endpoint. When the parent process has no explicit `HTTP_PROXY`, `HTTPS_PROXY`, or `ALL_PROXY`, the host converts the first supported Chromium `PROXY`, `HTTPS`, `SOCKS4`, or `SOCKS5` route into `HTTP_PROXY` and `HTTPS_PROXY` for Harness. The environment also bypasses `127.0.0.1`, `localhost`, and `::1`, preserving local Harness traffic. Harness-managed subprocesses inherit these ordinary environment entries through the existing credential scrub, so the published Codex connector receives the same network route without modifying its source or the user's Codex configuration.

Explicit proxy environment variables remain authoritative. A direct route, unsupported proxy route, malformed result, or resolver failure leaves the process environment unchanged. The host logs only whether system proxy inheritance was enabled and never logs the resolved proxy address.

## Alternatives considered

**Modify the published Codex connector.** The desktop installs the official package from npm and cannot replace an already published DeepSeek-scoped version. A later connector can enable Codex's native system-proxy feature, but that does not repair existing installations.

**Copy the system proxy into `~/.codex/config.toml`.** This would make the desktop a second owner of native Codex configuration and could overwrite settings used by Codex CLI and the Codex app.

**Disable WebSocket transport.** HTTPS fallback avoids the repeated handshake delay but gives up the product's preferred transport and does not make other managed network clients follow the desktop route.

## Consequences

Codex delegation from the desktop follows the system proxy on macOS, Windows, and Linux when Electron can resolve one, while explicit deployment proxy variables retain priority. The environment route is process-scoped and disappears when the desktop exits. PAC files that resolve different proxies for different external destinations remain limited by the single proxy URL expressible through these conventional child-process variables; native connector support remains the more precise future path.
