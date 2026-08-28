---
description: "Electron-only client settings for desktop preferences, command-line registration, and release discovery."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-desktop-shell

English | [中文](README.zh.md)

## Summary

This package contributes Electron-only General Settings rows for close behavior, native notifications, login launch, the managed `dsh` command-line entry, and Release discovery. An ordinary `dsh web` browser receives no contribution.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the security boundary](#understand-the-security-boundary)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Mount the package in the desktop client bundle. It activates only when the narrow `window.deepSeekHarnessDesktop` preload bridge is present and reflects capabilities reported by the Electron main process.

-----

<a id="understand-the-security-boundary"></a>
## Understand the security boundary

The preload bridge owns every privileged operation. This package receives normalized state and requests allowlisted actions; it cannot read arbitrary files, run arbitrary commands, choose arbitrary external URLs, or replace the application runtime.

<a id="model-experience"></a>
## Model Experience

None, as Electron-only desktop preferences and Release links; registers nothing model-facing.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- Platform capabilities differ: login launch and shell profile integration are reported by the desktop host rather than assumed by the browser.
- Release installation remains host-controlled and requires a verified artifact; the client package never executes an installer itself.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

Keep IPC narrow and capability-based. Renderer props must not accept arbitrary filesystem paths, commands, or URLs.

</details>
