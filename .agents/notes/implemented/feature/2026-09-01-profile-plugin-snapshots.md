# Agent Note: Profile plugin snapshots

Status: implemented

English | [中文](2026-09-01-profile-plugin-snapshots.zh.md)

## Problem

Plugin quarantine and Profile Doctor can recover failures they can classify while Harness is available. They cannot provide a known-good rollback when a plugin mutation damages the dependency graph, the diagnostic UI cannot load, or a nominally valid rollback still prevents the desktop client from becoming ready. Copying `node_modules` would make snapshots very large and platform-specific, while rolling back all of `DSH_HOME` would overwrite unrelated sessions, credentials, settings, and plugin business data.

## Decision

App Boot owns `dsh/profile-plugin-snapshot/v1`. A snapshot stores only the Web Profile dependency manifest, exact pnpm lockfile, workspace build policy, quarantine record, bundled-plugin seed markers, and imported-plugin restore state. Metadata records checksums, a redacted package projection, ordered Bundles, runtime versions, and whether a referenced local source is already missing. It excludes installed modules, the pnpm store, user patches, settings, credentials, sessions, and plugin-owned data.

Every mutating `dsh plugin` invocation obtains the Profile mutation lock, captures an automatic pre-change point, and removes it when the managed-file fingerprint did not change. Startup seeding creates one batch point instead of six individual points. The newest ten changed automatic points are retained. A manual point remains until explicit removal, and each fully ready desktop replaces the single `bootable` point. Safety points created by a restore transaction cannot be removed through the ordinary UI.

Desktop executes snapshot operations through closed CLI commands and projects only opaque ids, bounded labels, and explicit network consent through preload. Recovery stops Harness, creates a safety point, verifies every snapshot payload before the first mutation, atomically restores managed files, and asks the embedded pnpm for an offline frozen install. If cache material is missing, Desktop restores the safety point before offering an explicitly confirmed online retry. Read-only Doctor must pass before restart. The restore commits only after both client and event-dispatch readiness markers arrive; a Harness failure or readiness timeout restores the safety point and restarts the prior state.

The Diagnostics page renders the normal management card. The static loading page uses the same narrow Electron IPC directly, so a user can select a rollback point even when Host, Remotes, plugin inventory, and the main React tree cannot start.

## Alternatives considered

**Archive `node_modules`.** Rejected because it duplicates hundreds of megabytes, retains native binaries for one platform, and bypasses pnpm integrity and lockfile validation.

**Restore the entire Profile or `DSH_HOME`.** Rejected because `cordis.patch.yml`, `settings.yaml`, credentials, sessions, and plugin data are outside plugin deployment state and may contain newer user work or secrets.

**Fall back from frozen to ordinary resolution automatically.** Rejected because a recovery operation must not silently select newer package versions. Missing cache requires a separate network confirmation and still retains the exact lockfile.

**Declare success at the Harness ready URL.** Rejected because the server can listen while client modules or event dispatch still fail. Desktop readiness is the commit boundary.

## Consequences

Users receive a bounded rollback for plugin-stack regressions without losing conversation or configuration data, including a recovery entry that remains available when the main application cannot render. Registry and Git recovery still depends on pnpm store availability or an explicitly allowed network. Missing `file:`, `link:`, and workspace sources are surfaced before recovery and are not copied into snapshots. The feature adds a small local metadata history and one exact Profile mutation protocol shared by CLI and Desktop rather than a second package manager.

## Verification

App Boot tests cover capture, differences, exact restore, explicit build denial preservation, unchanged automatic cleanup, safety-point retention, and all-payload preflight before mutation. Desktop manager tests cover two-marker commit, offline-cache rollback before network consent, and automatic rollback after startup failure. Bridge tests pin the renderer boundary. Type checking covers App Boot, CLI, Desktop, and the plugin-inventory client; the Desktop build verifies loading-page assets and the bundled preload path.
