# Agent Note: Home plugin discovery

Status: implemented

English | [中文](2026-08-16-home-plugin-discovery.zh.md)

## Problem

The new-session home screen did not expose the Harness plugin ecosystem. Users had to discover community projects elsewhere, distinguish installable DSH plugins from unrelated GitHub topic results, and transcribe installation commands without an in-product source or safety warning.

## Decision

The conversation owner declares the root-scoped single slot `conversation.hero.pluginDiscovery` beside the Workspace and agent-preset controls. The plugin-inventory package contributes a compact entry through that slot, so the conversation package does not depend on discovery data or installation behavior.

The entry opens a static curated catalog of community projects that explicitly document an official `dsh plugin --profile ... add ...` command and publish an identifiable open-source license. Cards show the repository, license, third-party status, dated Star band, and documented command. The list is collected from current GitHub evidence and ordered as a discovery guide rather than treating topic membership as validation. A footer links to the complete `dsh-plugin` topic for broader exploration.

Each card offers command copying and a guarded install action. Installation requires an explicit acknowledgement that third-party package and lifecycle code runs on the local machine. The browser sends only a structured profile name and npm registry package specifier; the Host rejects paths, URLs, flags, and shell text, then starts the product CLI's `dsh plugin --profile ... add ...` path as a managed background process. The UI polls bounded job state, presents failure diagnostics, and reports that a successful bundle becomes active after Harness restarts. Repeated clicks for the same running target reuse one job.

The install Remote is not a generic shell bridge. It reconstructs the running dsh launcher and hands fixed argument positions to the subprocess capability without shell interpolation. Each card still warns that Stars do not indicate DeepSeek review or security endorsement and asks users to inspect source, permissions, lifecycle scripts, and license before installation.

## Alternatives considered

- **Query GitHub from every browser session:** rejected because topic results include unrelated repositories, unauthenticated limits reduce reliability, and a live ranking cannot establish compatibility or safety.
- **Copy commands without an install action:** rejected because it makes every user leave the client and repeat a command the product already owns. The guarded Host job supplies the missing trust decision, progress, failure reporting, and deduplication without exposing arbitrary command execution.
- **Accept arbitrary pnpm arguments, Git URLs, or filesystem paths:** rejected because a browser payload could then select code outside the reviewed card or alter package-manager behavior. The initial UI accepts npm registry package specifiers only; other sources remain available through the CLI.
- **Hard-code the entry in the conversation component:** rejected because ecosystem discovery belongs to the plugin-inventory feature and the conversation shell already provides extension slots for independent home controls.
- **List every repository carrying the topic:** rejected because topic membership alone does not prove a DSH installation path or relevant capability.

## Consequences

Users can discover representative high-interest DSH projects from the home screen, inspect source and the exact CLI command, install with an explicit trust acknowledgement, and continue to the broader GitHub topic. Installation uses the same profile package-manager and bundle reconciliation semantics as the CLI, while the current process stays unchanged until restart. The application makes no runtime GitHub request and exposes no arbitrary shell interface. Star bands and commands can become stale, so their collection date is visible and maintainers must refresh the curated records against project documentation.
