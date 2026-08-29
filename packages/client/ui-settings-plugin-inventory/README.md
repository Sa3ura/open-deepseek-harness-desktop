---
description: "Plugin inventory, diagnostics, recovery, external-tool settings, and live Plugin Market discovery surfaces for the dsh web client."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-settings-plugin-inventory

English | [中文](README.zh.md)

## Summary

`dsh-client-ui-settings-plugin-inventory` provides the client surfaces for plugin inventory, diagnostics, imported-plugin recovery, external tools, and Plugin Market discovery. Its new-session **Explore plugins** control requests four current popular entries from the installed market only when opened, shows market-owned popularity and Profile state, and navigates installation or management into the complete market. It keeps no duplicate plugin catalog or fallback statistics. The existing **Plugin list** tab lazily reads the Host inventory and renders searchable Loader state and configuration.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Open the Plugins section in Settings and select the **Plugin list** tab to inspect the Host's plugin inventory. The tab reads no Remote during plugin activation — selecting it for the first time mounts the component and lazily calls `ctx.remote.pluginInventory.list()` through `api-remotes`.

### Exploring market plugins

Open **Explore plugins** on the new-session page to request the market's live preview. The four cards show category, author, description, 30-day downloads, stars, and installed, uninstalled, restart-required, or unavailable state. A card opens the matching market tab and package; the preview itself performs no third-party plugin mutation. If the market is absent or lacks the preview API, an explicit install or update uses the checked bundled market archive and reports that a quick restart is required. Network and catalog failures show their actual message and can be retried without stale fallback data.

### Reading a card

Each collapsed card uses the short module name as its title and a small effective-enablement tag; enabled entries also show a colored root-fiber status dot. Expanding one card reveals its Loader-tree entry id, followed by the effective configuration and, for enabled entries, Cordis status; disabled entries omit the redundant unmounted runtime state. Search filters the catalog by name and entry id.

### Retrying a failed read

A failed read renders a generic failure state inside the tab; retrying re-runs the lazy `list()` call without exposing transport details.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The inventory tab is a read-only projection of a Host-owned snapshot; it performs no Remote read during plugin activation and takes the snapshot on first selection. Discovery is a separate lazy browser request to the market-owned `dsh-market/preview` endpoint. A settings-domain navigation request carries the target market tab and package without coupling this package to the settings shell or duplicating the market's installed-source matcher.

### Registration

The browser plugin registers one localized `settings.plugins.tab` contribution with id `all`; the Plugins section owns the navigation entry and tab chrome. Registration uses `ctx.slots.inject()`, so it follows late tab declaration, redeclaration, locale changes, and teardown without importing the section owner.

### Rendering

The entry id remains the React key, disclosure identity, detail value, and an additional search target; it is never classified by string shape.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

These pages cover the settings section, the remote call, and the Host-side projection.

- [ui-settings-plugins](../ui-settings-plugins/README.md) — the Plugins section this tab registers into.
- [ui-settings](../ui-settings/README.md) — the domain base declaring `settings.plugins.tab`.
- [api-remotes](../../api/remotes/README.md) — the Remote BFF surface behind `pluginInventory.list()`.
- [plugin-inventory](../../host/plugin-inventory/README.md) — the Host-side read-only Loader projection this tab renders.

-----

<a id="model-experience"></a>
## Model Experience

None, as the package is a browser-side inventory projection that registers nothing model-facing.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>


These limits define the freshness and reach of the inventory and discovery views; they are current package constraints.

- **One snapshot per Settings mount or retry** — the tab does not subscribe to Loader changes or automatically refetch after reconnect; switching tabs preserves the current snapshot, while reopening Settings obtains a new one.
- **Read-only Loader view** — local search does not add provenance, current-browser activation diagnosis, grouping by source, or plugin mutation controls.
- **Market-owned discovery availability** — the preview requires a current Plugin Market and its catalog connection; an older bundled market must be upgraded and the client restarted before preview data is available.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
