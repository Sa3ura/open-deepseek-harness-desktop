# Agent Note: Removable bundled preset plugins

Status: implemented

English | [中文](2026-08-18-removable-bundled-plugin-market.zh.md)

## Problem

Desktop packages should provide selected Web plugins offline while keeping each one as an ordinary profile dependency that the user can remove and later update. Large or product-specific integrations should not delay startup or install without an explicit user action. Core Cordis bundle entries would make launches restore removed plugins, while installing every carried archive as a `file:` dependency hides registry identity from update tooling.

## Decision

Electron resources ship six pinned tarballs with SHA-512 integrity. Before packaging, pnpm resolves every exact registry entry through its `latest` stable dist-tag at the canonical npm registry, downloads and verifies the returned tarball, and atomically replaces the snapshot. A fixed Git entry retains its reviewed commit and archive. GitHub packaging resolves one snapshot in a prerequisite job and gives those exact files to every platform job. The target-specific packaging step also adds the official Codex provider with its native payload. Manifest schema 2 marks each entry as `startup` or `manual` and retains the exact resolved registry or pinned Git spec for presentation and later explicit updates.

Packaged startup processes only the five startup entries in manifest order and always gives pnpm the integrity-checked local archive path instead of the registry package spec. Startup and deferred preset installation therefore never resolve or download the plugin tarball itself; the Profile package manager still owns ordinary transitive dependency resolution and store reuse. Success, or an existing dependency with the same package name, writes that plugin's durable seed marker without replacing an installed version. A failed entry writes a diagnostic and does not prevent the remaining startup entries from seeding. Runtime preparation installs the same startup subset from the snapshot into a disposable profile; manual entries are retained and integrity-checked without executing their optional lifecycle code before a user requests installation.

Better Sidebar remains a manual manifest entry but is deferred until the shell is usable: a bottom-right overlay reports integrity verification, extraction and configuration without blocking conversation work. Hiding it does not cancel the job; settled success and failure return to the surface, with narrow restart or fixed-log actions. A durable marker suppresses the deferred start after a prior install or uninstall, while the existing discovery action can explicitly replace that tombstone. Codex remains manual from External Tools. The renderer receives no generic installer: a sandboxed preload forwards only exact profile and package-spec pairs found in manual manifest entries. Other package requests continue through the guarded Host Remote. One target has at most one active package-manager writer and polling retains bounded diagnostics.

Each marker survives profile removal, so future launches do not reinstall that plugin. Windows packages run the embedded `pnpm.mjs` through their official Node executable with an argument vector and no shell interpolation. The Host exposes exact-package removal, while startup and manual entries remain ordinary dependencies removable through the standard profile plugin manager.

## Alternatives considered

- **Core Web bundle:** rejected because it would not be independently removable.
- **Seed whenever missing:** rejected because it would undo a user uninstall.
- **Install every carried archive before Harness starts:** rejected because Better Sidebar is large enough to delay first entry and Codex must remain user initiated. Better Sidebar instead starts after the usable shell is visible.
- **Resolve `latest` independently in each platform job:** rejected because one publication during the matrix run could produce platform installers with different plugin versions.
- **Resolve `latest` when the installed application starts:** rejected because first launch must remain offline and deterministic.
- **Prefer registry identity at startup with archive fallback:** rejected because even a best-effort registry request makes preset installation depend on network state and increases startup variance.
- **Rewrite the lockfile after local installation:** rejected because offline registry metadata is not guaranteed and manual lockfile mutation would bypass pnpm's resolution contract.
- **Plugin self-uninstall:** rejected because a plugin cannot reliably remove its own active package and bundle.
- **System Node and pnpm on Windows:** rejected because packages must be self-contained.

## Consequences

macOS, Windows, and Linux artifacts carry one shared resolved snapshot of six audited community archives plus a target-specific Codex archive. Packaging requires npm registry access, but preset installation in the released application does not. A local packaging command refreshes registry-backed archives unless `DSH_BUNDLED_PLUGINS_REFRESH=0` requests verification of a pre-resolved snapshot. Better Sidebar consumes profile installation time only after the shell is usable; Codex consumes none until requested. Tests cover stable-version rejection, archive integrity, atomic snapshot replacement, local-only installation, adoption, uninstall-marker suppression, single-flight jobs, staged progress, bounded diagnostics, and renderer fallback. The installed Windows smoke still requires the five startup dependencies before artifact upload; Better Sidebar completion is a post-entry behavior and Codex must remain absent before user action.
