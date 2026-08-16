# Agent Note: Desktop runs the Web profile as a supervised local process

Status: implemented

English | [中文](2026-08-16-desktop-supervised-web-host.zh.md)

## Problem

DeepSeek Harness already owns the browser interface, provider and model configuration, plugin settings, Skill invocation, sessions, workspaces, and interaction requests. A native application still needs to start that product without a terminal, keep it alive, present startup state, and constrain the extra authority introduced by a desktop web renderer.

Building a separate desktop client would create another implementation of the client plugin roster and another persistence model. It would also make every Harness UI capability choose between two release paths before independently released clients have a protocol-version contract.

The source host must establish a macOS development path without claiming installer support that does not exist. Windows and Linux also need an architecture that does not encode macOS-only lifecycle behavior.

## Decision

`apps/desktop` is an Electron application assembly outside `packages/`. Its main process directly starts the built `dsh` launcher with the `web` profile on `127.0.0.1` and port `0`, then loads the exact URL from the canonical `dsh web:` readiness line. The renderer is the existing Web GUI; desktop does not copy client plugins, API Provider settings, credentials, sessions, or Skills into a second application model.

One `HarnessSupervisor` owns the child process, its combined append-only log, unexpected-exit restart delay, and bounded shutdown. The launch uses an argv vector with no shell. Readiness accepts only an HTTP URL on literal `127.0.0.1`; unrelated output and non-loopback URLs cannot choose renderer navigation.

The BrowserWindow enables context isolation and renderer sandboxing and disables Node integration. Top-level navigation is limited to the chosen loopback origin. New HTTPS windows are handed to the system browser, other window creation is denied, and renderer permission requests are denied. No preload bridge exists because the Web client needs no Electron privilege.

The desktop package ships only a source-run milestone. A compatible Node executable and built checkout remain prerequisites. Installer support begins only when the artifact contains a reviewed Node runtime and the published Harness dependency closure and its native dependencies are built on each target platform.

## Extension ownership

Desktop chrome owns operating-system lifecycle and presentation only. Harness services remain authoritative for model configuration, plugin inventory and configuration, Skill discovery and invocation, workspace selection, approvals, and session state.

Future WeChat, Discord, and Slack control enters through a Harness transport service with provider plugins. Each adapter maps authenticated platform identities to Harness principals and durable sessions and uses interaction services for approvals and questions. Identity mapping, authorization, audit events, revocation, and rate limiting do not belong in Electron or an agent-loop conditional.

## Alternatives considered

- **Reimplement the GUI as a desktop-specific React application:** rejected because it duplicates the existing plugin-composed client, creates configuration drift, and requires every feature to maintain two UI integrations.
- **Load built frontend files and carry the API over Electron IPC:** deferred because the current Web profile already provides an assembled and tested loopback carrier. IPC is appropriate only when a desktop threat model or an independently released client justifies a second transport implementation and protocol compatibility policy.
- **Use Tauri for the first host:** rejected for this milestone because the Harness runtime and PTY stack already require Node, so a Rust shell would not remove that runtime and would add a second toolchain before packaging is solved. The application assembly keeps Harness services independent of Electron, so a later native host remains possible.
- **Bundle the entire workspace checkout:** rejected because it includes development-only files, produces an unaudited dependency set, and weakens third-party notice and credential-exclusion guarantees. Installers use a published runtime closure instead.

## Consequences

macOS developers get one command that opens the complete Harness GUI and supervises its real local process. The window inherits every existing Provider, plugin, Skill, workspace, and conversation improvement without desktop-specific synchronization.

The loopback HTTP server remains part of the desktop process tree. Its existing host and origin fences therefore remain security-critical, and the Electron window adds no privileged bridge that could bypass them.

Windows and Linux source compatibility follows from shared Electron and Node process APIs, but release support is not implied. Native runtime staging, architecture-specific dependencies, process-tree validation, signing, notarization, installers, and update rollback remain release work and are stated as limitations in the desktop README.

Focused tests pin readiness parsing across chunk boundaries and direct launch resolution. The existing Web e2e suite remains the product-interface coverage because the desktop renderer runs that same assembled application.
