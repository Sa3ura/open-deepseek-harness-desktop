# Agent Note: Validated desktop data source selection

Status: implemented

English | [中文](2026-08-26-desktop-data-source-selection.zh.md)

## Problem

The first-run desktop chooser treated any nonempty default `~/.dsh` directory as official Harness data and skipped the chooser completely when that directory was absent or empty. Users with a custom `DSH_HOME`, a portable copy, or a backup could not select it, while unrelated files could expose import and reuse actions that would later fail.

## Decision

The chooser always opens when the desktop-owned Harness home has no prior selection or data. A source panel reports whether the default location contains recognized Harness state and keeps directory selection available in every state. A recognized default source selects independent import; an absent or unreadable default selects fresh setup while leaving import and direct use available through the directory picker.

Electron owns directory selection and validation. A directory is recognized when it or its `.dsh` child contains supported user state or a Profile. The renderer receives only the normalized result and submits a selected mode plus source; Electron resolves and validates that source again before importing or reusing it. Empty, unrelated, and unreadable directories remain on the chooser with a bounded correction message.

Independent import copies from either the detected default or the selected custom source into the desktop-owned home. Direct use records the normalized custom source as the active `DSH_HOME`; startup validates that recorded source before reuse so a removed or unreadable directory returns to the chooser. Fresh setup does not require a source. The existing language picker and three data strategies remain available in every first-run state.

## Alternatives considered

**Add “custom import” as a fourth data strategy:** rejected because directory location and data-sharing behavior are independent decisions. A persistent source panel keeps custom paths available without creating a second import mode with identical semantics.

**Hide import and reuse when `~/.dsh` is absent:** rejected because absence at the default location does not prove that the user has never used DSH. The two actions instead open the directory picker before they can be selected.

**Accept any nonempty directory:** rejected because unrelated files are not evidence of a usable Harness home and defer a correctable error until import or startup.

## Consequences

- First-time users without official DSH data see the language-aware chooser and can continue with fresh setup without extra configuration.
- Users with default or custom Harness homes can import into isolation or deliberately share the selected directory.
- Selecting a user-home parent automatically resolves its `.dsh` child when that child contains recognized data.
- A directory containing only unsupported files cannot be imported or reused.
- Custom reused paths are durable, but moving or revoking access to the directory requires selecting a source again.
