# Agent Note: Bound Windows installer process detection to desktop-owned executables

Status: implemented

English | [中文](2026-08-26-windows-installer-process-guard.zh.md)

## Problem

Electron Builder 26.15.3 treats every process whose executable path starts with the NSIS installation directory as a running application. DeepSeek Harness carries Node, Harness, and plugin executables below that directory, while users may also run an installer or unrelated executable from a path with the same textual prefix. The generic dialog did not name the matched process, so a hidden runtime child or a false prefix match appeared as an invisible DeepSeek Harness instance that could not be closed.

## Decision

The desktop NSIS include replaces the generic check with an installation-owned process guard. It matches only the exact application executable and executables below the `resources` directory boundary, excludes the current installer PID, and reports the matched PID, name, and executable path. Interactive installation asks before cleanup; silent installation performs the same bounded cleanup. The guard first requests GUI processes to close, then force-stops only remaining matches and fails closed with actionable details when elevated processes remain.

A fresh target directory contains neither the desktop executable nor packaged `resources`, so no installed process can lock files there. NSIS detects that state without starting PowerShell and skips process inspection. Existing and partially installed targets still enter the guarded inspection path whenever either installation-owned boundary is present.

Explicit Windows desktop quit also stops the supervised Harness process tree through `taskkill /T`, with `/F` reserved for the bounded timeout. Closing a window to the tray remains an ordinary running state and is intentionally detected during an upgrade.

The custom installer include is expanded before Electron Builder inserts MUI2 and its `MUI_LANGUAGE` macros. Custom Chinese and English `LangString` declarations therefore use the stable Windows LCIDs 2052 and 1033 directly; referring to `${LANG_SIMPCHINESE}` or `${LANG_ENGLISH}` at that point leaves the constants undefined and makes NSIS fail because warnings are treated as errors. The command-line option page functions are emitted through Electron Builder's `customHeader` hook, after MUI2 and languages load, so `MUI_HEADER_TEXT` is available when NSIS expands it.

## Alternatives considered

**Match only `DeepSeek Harness.exe`.** This avoids false positives but misses embedded Node and native plugin processes that can still lock files replaced by an upgrade.

**Keep the directory-prefix match and improve the dialog.** Better wording does not prevent an installer or unrelated process in a prefix-similar path from blocking installation or being terminated.

**Always force-close matches without confirmation.** This can interrupt an active desktop-managed `dsh` command. Interactive installation therefore asks first, while explicit silent mode remains non-interactive.

## Consequences

An installer or unrelated process in a prefix-similar directory no longer blocks an upgrade or gets terminated. Real application, embedded Node, Harness, and native plugin processes remain protected from in-place replacement. Windows package validation now upgrades a running installation from a prefix-similar sibling, cleans an orphan embedded Node process, keeps an unrelated sibling process alive, and proves post-upgrade Harness readiness.

The Windows installer also keeps reviewed Simplified Chinese and English strings without depending on NSIS macro declaration order, so the native packaging job rejects regressions before an installer is published.
