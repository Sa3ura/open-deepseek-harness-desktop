# Agent Note: Market-owned plugin discovery

Status: implemented

English | [中文](2026-08-29-market-owned-plugin-discovery.zh.md)

## Problem

The new-session plugin discovery surface carried a second, fixed catalog with stale popularity numbers and no reliable relationship to the active Profile. Its direct GitHub route also bypassed the product surface that owns plugin installation, updates, availability, and diagnostics.

## Decision

The Plugin Market owns discovery data and returns a versioned four-item preview built from its live catalog and existing installed-source matcher. The preview excludes the market itself, deprecated entries, and entries without an install source; it sorts by 30-day downloads, then stars, then name. The conversation surface requests this preview only when opened and delegates installation or management to a process-local settings navigation service that can select a section, tab, and package.

An absent market is installed only after explicit confirmation from the checked bundled archive. An installed market without the preview API is upgraded through the same controlled archive path and requires a restart. Network and catalog failures remain visible and never fall back to fixed statistics.

The market compares ordinary npm installs with the registry and recognized GitHub installs with repository HEAD. A local `file:` or `link:` source remains non-updatable unless the package has an explicit trusted release channel; this exception lets the locally seeded market detect its own published upgrade without guessing update ownership for arbitrary local plugins.

## Alternatives considered

**Keep the fixed discovery cards.** This preserves instant rendering but duplicates catalog, popularity, and installation-state logic and inevitably presents stale or false facts.

**Install directly from the preview.** This saves one navigation step but splits install, update, restart, and diagnostic behavior across two surfaces. The preview stays a discovery and navigation surface.

**Infer repositories for every linked package.** Package metadata and names do not prove that a local checkout may be replaced by a remote release. Linked packages remain local unless a trusted release channel explicitly owns that transition.

## Consequences

Users see current popularity and Profile state in both Electron and web compositions, and every mutation remains in Plugin Market. Opening discovery now depends on the market preview endpoint and its network/catalog health; failures are honest and retryable. Older market installations need one controlled bundled upgrade and restart before live preview is available.
