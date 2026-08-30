# Agent Note: Keep settings actions and contributed navigation reachable

Status: implemented

English | [中文](2026-08-29-settings-native-open-and-navigation-overflow.zh.md)

## Problem

The settings document action used the native path opener, whose Windows adapter spawned the bare name `powershell.exe`. A restricted Host `PATH` made the button fail even though Windows and its file association were available. The settings navigation also had no bounded scrolling child, so contributed section rows beyond the panel height were clipped by the panel overflow rule.

## Decision

Native Windows resolves the inbox PowerShell executable from `SystemRoot`, with `WINDIR` and the standard Windows directory as fallbacks. The adapter keeps shell-free argv execution and uses the bare command name only for WSL interop, where the Linux process cannot address a native Windows filesystem path directly.

The settings rail keeps its title outside a dedicated navigation scrollport. The rail and list may shrink in a bounded flex column, while each contributed row retains its full height. The scrollport contains wheel overscroll and reserves a stable themed scrollbar gutter. Settings overlays subtract the desktop title-bar inset from their fixed position and maximum panel height.

The follow-up audit applies the same safe-area contract to the shared body-portaled `Modal`, onboarding takeover, connection banner, attachment drop overlay, and image lightbox. It constrains default modal content to an internal scrollport and gives the multi-column setup wizard bounded scrolling on both sides. This covers full-window surfaces that escape the already-inset application root and keeps controls reachable in short windows or at high display scaling.

## Alternatives considered

**Keep invoking bare `powershell.exe` and repair the Host PATH.** This would leave a user-facing file action dependent on mutable process-environment composition and would regress whenever a restricted launcher omitted Windows system paths. Resolving the inbox executable directly gives the native adapter a deterministic dependency without broadening every child process PATH.

**Scroll the complete settings panel or navigation rail.** Scrolling the outer overlay would move its title and actions, while scrolling the whole rail would also move the navigation heading. A dedicated shrinking list scrollport keeps persistent controls fixed and makes only the unbounded contributed rows scroll.

**Patch only the settings overlay for the custom title bar.** Other body-portaled surfaces bypass the inset application root in the same way, so a settings-only offset would leave onboarding, shared modals, banners, drop targets, and lightboxes vulnerable. Applying one safe-area contract to every full-window portal avoids another component-by-component gap.

## Consequences

Opening the settings document no longer depends on inherited Windows PATH entries. An arbitrary number of plugin-contributed settings sections remains reachable by pointer, wheel, and keyboard focus without moving the settings title. Body-portaled configuration dialogs also stay below custom window chrome and within the available height. Ordinary browsers use a zero title-bar inset, and the desktop preload supplies the custom-frame value.
