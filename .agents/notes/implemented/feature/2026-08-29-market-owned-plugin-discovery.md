# Agent Note: Desktop-owned plugin discovery preview

Status: implemented

English | [中文](2026-08-29-market-owned-plugin-discovery.zh.md)

## Problem

The new-session plugin discovery surface carried a second, fixed catalog with stale popularity numbers and no reliable relationship to the active Profile. Its direct GitHub route also bypassed the product surface that owns plugin installation, updates, availability, and diagnostics.

## Decision

The Plugin Market remains the source for its catalog and active Profile state through its existing registry and installed-state resources. The desktop conversation package owns the versioned four-item recommended and category compositions: it excludes the market itself, deprecated entries, and entries without an install source; it sorts once by 30-day downloads, then stars, then name, and fills each category during one pass. The compact catalog projection is cached for 24 hours, while installed state is read on every open and manual refresh always revalidates both resources. A card can deep-link to its complete market entry. An uninstalled npm-backed card can also submit its explicit package identity to the existing guarded installer after a third-party-code acknowledgement; catalog command strings and source-only entries are never executed directly.

An absent market is installed only after explicit confirmation from the checked bundled archive. Missing standard market resources are reported as an unavailable or outdated market. Network and catalog failures remain visible and never fall back to fixed statistics. No dedicated discovery route or preview UI is added to the Plugin Market source.

The market compares ordinary npm installs with the registry and recognized GitHub installs with repository HEAD. A local `file:` or `link:` source remains non-updatable unless the package has an explicit trusted release channel; this exception lets the locally seeded market detect its own published upgrade without guessing update ownership for arbitrary local plugins.

## Alternatives considered

**Keep the fixed discovery cards.** This preserves instant rendering but duplicates catalog, popularity, and installation-state logic and inevitably presents stale or false facts.

**Install directly from the preview.** This saves one navigation step but splits install, update, restart, and diagnostic behavior across two surfaces. The preview stays a discovery and navigation surface.

**Infer repositories for every linked package.** Package metadata and names do not prove that a local checkout may be replaced by a remote release. Linked packages remain local unless a trusted release channel explicitly owns that transition.

## Consequences

Users see recommended or category-specific entries and current Profile state in both Electron and web compositions. They can inspect any entry in the full market or install an npm-backed recommendation without leaving the preview while retaining the standard installer diagnostics and progress lifecycle. A fresh cache avoids repeated catalog downloads; an expired cache survives a failed refresh only behind an explicit stale warning, and failed installed-state reads become unknown rather than uninstalled. Preview ranking, filtering, layout, caching, navigation, and the guarded install affordance evolve with the desktop client rather than requiring a market-source feature release.
