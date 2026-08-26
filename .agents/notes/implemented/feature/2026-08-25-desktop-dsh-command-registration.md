# Agent Note: Optional desktop-owned `dsh` command registration

Status: implemented

English | [中文](2026-08-25-desktop-dsh-command-registration.zh.md)

## Problem

The installed desktop carries a complete target-native Node, Harness, and pnpm runtime, but users could reach it only through the graphical application. Adding every private executable to `PATH` would make terminal access convenient at the cost of colliding with system Node, Corepack, nvm, fnm, Volta, or an official `dsh` installation. A terminal launcher also cannot assume `~/.dsh`, because the desktop may use a fresh or imported independent home or may explicitly reuse the official home.

## Decision

**The desktop optionally registers only `dsh`.** Windows exposes an unchecked installer page and matching General Settings controls. Registration prepends one exact application resource directory to the current-user PATH; `/ADDCLI=1` is the only silent-install opt-in. macOS General Settings writes one marked PATH block to `.zprofile` or `.bash_profile`, preserving a one-time backup, and declines to modify unknown shells. Removal touches only the exact owned Windows entry or macOS marker block.

**Windows consumes the silent opt-in in the install section itself.** An assisted NSIS installer may cross an outer/inner instance boundary after initialization, so the actual install section re-parses `/ADDCLI=` instead of relying only on a variable populated by `customInit`. It logs the resolved choice and any registration failure to the installer details. A silent failure never waits on an invisible message box; the application installation can finish while the missing optional command remains diagnosable.

**PATH persistence does not synchronously broadcast through every desktop window.** The Windows helper writes the current-user `HKCU\Environment\Path` value directly while preserving its existing registry type, then uses the asynchronous `SendNotifyMessage` form of `WM_SETTINGCHANGE`. This avoids `.NET` environment persistence plus `SendMessageTimeout(HWND_BROADCAST, ...)` holding a silent installer behind an unresponsive window for minutes before the optional registration marker is written.

**The terminal command is a narrow app-owned launcher.** It uses absolute paths to the embedded Node, Harness entry, and pnpm entry and forwards arguments as an array to a shell-free child. npm and pnpm remain private implementation details and no global `DSH_HOME` is written. The renderer can request status, install or repair, and removal through fixed IPC operations; it cannot provide a path, executable, script, or command.

**The saved desktop data-home selection is authoritative on every invocation.** The launcher reads the packaged application's `data-home-setup.json`: fresh and imported modes use the independent desktop home, while reuse mode uses the official home recorded by the chooser. A missing choice, malformed record, or missing embedded runtime fails with an instruction to open and repair the desktop app. It never creates a fallback directory that could hide an environment split.

**Existing command ownership requires confirmation.** Status reports every non-owned `dsh` found on PATH. Installation stays cancelled by default and the desktop entry shadows it only after an explicit force confirmation. Application upgrades refresh an already registered macOS launcher without rewriting an absent shell block.

## Alternatives considered

- **Expose embedded Node, npm, and pnpm:** rejected because private package-management versions are part of the application runtime, not a supported user toolchain, and would compete with established version managers.
- **Always register `dsh` during installation:** rejected because command precedence is persistent external state and an existing official command may already own the name.
- **Set a global `DSH_HOME`:** rejected because it would change official CLI and other process behavior instead of selecting data only for this launcher.
- **Ship a macOS PKG or edit `/usr/local/bin`:** rejected because the existing DMG remains user-scoped and should not require elevated installation solely for an optional command.
- **Resolve the data home once when installing the launcher:** rejected because the user can change between independent and reused data through the desktop selection record; invocation-time resolution keeps the command and client aligned.

## Consequences

- A user can opt into `dsh` from Windows installation or General Settings and from macOS General Settings without installing system Node or pnpm.
- A new terminal is required after PATH configuration changes. macOS zsh and bash are automated; other shells receive an unsupported status rather than an unsafe guess.
- Moving or partially deleting the application produces a broken status and a repair path instead of silently falling back to another `dsh`.
- Linux remains unchanged until its package-specific PATH ownership and uninstall contract are designed.
- Unit tests pin setup parsing, argument forwarding, exit behavior, path conflicts, macOS backup and idempotence, Windows exact current-user PATH operations, and removal. The Windows package smoke opts in, runs the installed launcher from a path containing spaces and Chinese characters, then requires uninstall to restore the original user PATH.
