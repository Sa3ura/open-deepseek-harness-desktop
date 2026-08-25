# Agent Note: Independent desktop data home and official-data import

Status: implemented

English | [中文](2026-08-25-independent-desktop-data-home.zh.md)

## Problem

Source Electron runs, installed desktop builds, and the official `dsh` CLI all inherited the same unset-`DSH_HOME` fallback, `~/.dsh`. The packaged Node and Harness runtime were independent, but sessions, credentials, profiles, plugins, seed markers, and quarantine state were live-shared. Running a checkout beside an installed or official client could therefore change another surface's dependency graph and made an installed application look identical to development.

## Decision

**Desktop-owned data lives under a repository-named platform directory, with source and packaged modes separated.** Installed builds use `open-deepseek-harness-desktop/dsh-home` below Electron `appData`; source runs use `open-deepseek-harness-desktop/development/dsh-home`. Electron `userData`, browser `sessionData`, logs, extracted runtime, and Harness `DSH_HOME` follow the same packaged/source boundary. An explicit nonblank `DSH_HOME` remains authoritative.

**An existing official `~/.dsh` is used only after an explicit first-run choice.** Before Harness starts, a native dialog offers a safe copy into the independent home, direct reuse of the official home, or a fresh home. Copy uses an allowlist for settings, the opaque credentials document, sessions, workspace metadata, Agent presets, Skills, and connection state; it rejects symlinks and atomically renames a staging tree. Direct reuse intentionally restores the former shared configuration and plugin state. The durable decision record lives outside Harness home so it can be read before Harness starts.

**Plugin execution state is rebuilt, not imported.** Profiles, `node_modules`, lockfiles, bundled seed markers, dependency-health and quarantine records, and the anonymous user id are excluded. The selected runtime initializes the independent Profile. Installed builds reconcile packaged archives, while source runs reconcile the repository's reviewed archives, and the selected `DSH_HOME` reaches both the supervisor and every plugin lifecycle child. Development repairs schema-1 markers that could have been written before lifecycle environment propagation while schema-2 markers retain the uninstall tombstone contract. This prevents stale links, foreign native modules, old seed tombstones, or a different package-manager policy from crossing the import boundary.

**Reuse reconciliation expands policy without duplicating dependencies.** An existing top-level package is adopted regardless of its saved version or source. npm aliases and matching GitHub repository identities are also adopted, while distinct monorepo `path:` subpackages remain separate. Reviewed lifecycle packages are added to the existing `allowBuilds` mapping; unrelated approvals and comments survive, and an explicit `false` remains authoritative. Approvals are reconciled even when a valid seed marker already exists, provided the dependency is still installed.

**External product connectors remain explicit online installs.** Codex and Claude Code are not part of any platform installer or the repository's bundled-plugin manifest. The External tools page installs their exact official npm package only after a user action. Source runs use the checkout-pinned pnpm and installed builds use the embedded pnpm, avoiding ambient store-version conflicts without turning either connector into a desktop payload.

## Alternatives considered

- **Continue sharing `~/.dsh`:** rejected because an installed product, a checkout, and the official CLI could keep mutating one dependency graph and platform-native plugin tree.
- **Copy the whole official home automatically:** rejected because it would move credentials without consent and import stale profiles, native modules, links, lockfiles, quarantine state, and desktop seed tombstones.
- **Copy complete Profiles after consent:** rejected because replaying their package manifests before Harness starts needs package-manager and supply-chain decisions that cannot be proved by a filesystem copy. Plugins remain visible in the untouched source and can be installed again explicitly.
- **Translate official data into a desktop-only schema:** rejected because Harness already owns stable settings, credentials, session, and storage formats; an allowlisted byte-preserving copy avoids a second persistence implementation.

## Consequences

- Development, installed desktop, and official CLI sessions no longer mutate one another by default.
- Existing users can retain supported configuration and history without continuing a live shared dependency tree.
- Users who select direct reuse deliberately share settings, credentials, sessions, profiles, plugins, and their mutations with official dsh.
- Third-party plugins must be installed again in the independent home; this is intentional because copying their runtime cannot prove platform, ABI, or policy compatibility.
- Installing Codex or Claude Code requires network access at the moment the user requests it; restart and upgrade do not silently restore either connector.
- Removing the independent home after setup produces a fresh home without re-prompting; removing the separate setup record explicitly re-enables the first-run choice.

Testing covers the path and import boundaries directly:

- Pure path tests pin packaged and development roots plus explicit `DSH_HOME` precedence.
- Import tests cover supported data, excluded plugin state, symlink rejection, nonempty-target refusal, and atomic setup records.
- Desktop type checking and a development Electron startup verify that the chosen `DSH_HOME` reaches Harness readiness and the repository-named log path.
