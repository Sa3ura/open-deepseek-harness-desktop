# Agent Note: Synchronize desktop startup surfaces with the active theme

Status: implemented

English | [中文](2026-08-26-desktop-theme-synchronization.zh.md)

## Problem

The Web client persisted a built-in theme preference, but Electron startup documents and native or custom window chrome independently followed the operating-system appearance. A fixed dark theme on a light system, or a fixed light theme on a dark system, therefore produced visible palette changes between the data-home chooser, loading page, onboarding, main interface, and title bar.

## Decision

The active Harness home remains the authority for the persisted `ui-theme.preference`. Before creating the main window, the desktop host reads that field and maps every built-in skin to `system`, `light`, or `dark`; missing or malformed presentation state falls back to `system` without hiding the settings error from diagnostics. Electron's native theme and pre-paint background use the resolved source, so the loading page and native frame agree before the Web client becomes ready.

The Web theme presenter publishes the same three-value source on the document root while continuing to own the resolved palette and tokens. The sandboxed preload observes only that bounded attribute and sends it through a narrow IPC channel. Theme changes therefore update Electron chrome without exposing settings, filesystem, or arbitrary style operations to the renderer. `system` stays distinct from its current resolved scheme, so later operating-system appearance changes remain live.

The first data-home chooser has no selected Harness home and follows the operating-system appearance. Its static document provides complete light and dark styles. The onboarding flow remains inside the Web client and inherits the same theme snapshot as the main interface.

## Alternatives considered

**Let every startup page use `prefers-color-scheme` independently.** This cannot represent an explicit application theme that differs from the operating system and caused the original mismatch.

**Force Electron to the last resolved light or dark value.** Treating `system` as a fixed value stops subsequent operating-system appearance changes from propagating.

**Expose the full theme registry or settings API through preload.** Desktop chrome needs only a three-value source. A broader bridge would duplicate theme ownership and enlarge the renderer's authority.

## Consequences

Initialization, loading, onboarding, the main interface, BrowserWindow pre-paint pixels, and window chrome use one coherent light or dark base. Custom skins retain their Web token overrides while Electron consumes only their base scheme. The desktop host maintains a small read-only parser for the persisted preference because the Web runtime is not available during early startup.
