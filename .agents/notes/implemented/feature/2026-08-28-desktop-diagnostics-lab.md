# Agent Note: Desktop Diagnostics Lab

Status: implemented

English | [中文](2026-08-28-desktop-diagnostics-lab.zh.md)

## Problem

The production Profile doctor protects startup, but support still needs a repeatable way to prove that diagnosis, repair, quarantine, recovery, and cleanup behave correctly on a particular packaged installation. Installing one deliberately incompatible third-party plugin into the user's live Web Profile made the demonstration depend on network state and package-manager history, could leave residue after interruption, and was unavailable in some installed builds.

A useful exercise must cover multiple pnpm, shared-Host, Loader, and configuration failure classes without accepting arbitrary renderer commands or sacrificing the Profile it is intended to validate. Repeating an exercise also has to detect cumulative residue instead of merely reporting that one pass appeared successful.

## Decision

The desktop host owns a versioned Diagnostics Lab behind a narrow Electron bridge. Its catalog contains nine fixed scenario identifiers and fixed fixture bytes: compatible and incompatible Host shadows, orphaned Bundles, missing modules, invalid patches, duplicate Loader rows, lifecycle failures, blocked build approval, and interrupted repair. The renderer may select only those identifiers, the `quick`, `standard`, or `soak` preset, and an isolated or explicitly confirmed active-Profile target. It cannot provide a package name, path, command, script, environment value, or fixture content.

The default target creates a run-specific home under Electron `userData`. Each round follows the same six observable phases: healthy baseline, injection, detection, repair or isolation, verification, and cleanup. Fixture bytes are checked against their built-in SHA-256 value after injection. Results retain the expected and actual product code, repair disposition, cleanup result, duration, and a bounded redacted diagnostic. Runtime data is removed on success, assertion failure, and cancellation; JSON and text reports remain in the desktop log directory.

Every phase crosses the production `dsh plugin --profile web doctor` subprocess boundary rather than using a timer as a stress surrogate. Compatible Host shadows, incompatible Host dependencies, and orphaned Bundles additionally construct real isolated Profile dependency graphs through the bundled pnpm in offline mode; the fixture packages are package-manager-owned rather than manually placed in `node_modules`, so the production repair operation can genuinely relink or remove them. The compatible case must return `repaired`, while the incompatible and orphaned cases must return `quarantined`; every case then requires a clean read-only recheck. Loader and configuration fixtures still validate the closed desktop classifier/recovery contract while running production Doctor baseline checks; they are not represented as production Loader activation tests.

The advanced target is opt-in and pauses the supervised Harness before writing. It backs up the allowlisted Profile manifest, Workspace policy, patch, quarantine record, and retained health report with hashes and a write-ahead recovery journal. Exercise data uses a namespaced `.diagnostic-lab/<runId>` directory instead of copying or adopting user `node_modules`. Every round verifies and restores managed bytes before the next round. A hash change that cannot be attributed safely is treated as an external edit: the lab stops, preserves its journal, and does not restart Harness. On the next application start, pending journals are recovered before Profile plugins may load.

Only transactionally reversible scenarios are offered for the advanced target. Invalid patch, lifecycle execution, build-script approval, and controlled interruption remain isolated-only. Cancellation is observed at a scenario boundary so cleanup and final health checks still run. The manager serializes runs in one process; production plugin operations remain authoritative and the lab does not create a generic package-manager or filesystem IPC.

## Alternatives considered

**Keep the source-only “install diagnostic test plugin” button.** Rejected because it exercised only one incompatible dependency, mutated the live Profile, relied on source paths and network/package-manager state, and could appear to do nothing in an installer.

**Let the renderer assemble arbitrary fault packages or shell commands.** Rejected because a Web client would gain a general code-execution and filesystem capability. A closed catalog and fixed bytes keep the authority in the desktop main process.

**Run every destructive case against the active Profile.** Rejected because malformed patch and lifecycle/build-script cases cannot be restored with the same confidence as namespaced manifest and Loader fixtures. Those scenarios stay in the disposable home.

**Restore the whole Profile or `node_modules` tree after a run.** Rejected because it can overwrite concurrent user changes, copy platform-specific package state, and obscure which bytes the exercise changed. The journal owns a small allowlist and refuses to overwrite unexpected hashes.

## Consequences

Development and installed builds expose the same offline exercise surface, and support can distinguish a failed diagnostic assertion from failed cleanup or recovery. Standard and soak presets make residue and idempotence visible across three or ten rounds. Reports are shareable without usernames, credentials, tokens, private repository authentication, arbitrary environment values, or unbounded stacks.

The feature adds desktop-owned fixtures, recovery journals, a second Settings workflow, and a deliberate fail-closed startup dependency. The isolated scenarios validate the desktop's classification and recovery choreography; they do not turn arbitrary third-party lifecycle scripts into safe code and do not replace production Doctor evidence. Active-Profile exercises temporarily stop Harness, so they remain an advanced troubleshooting action rather than a background health check.

The Electron main process, not the Harness renderer, owns the active run. A `current` bridge operation lets a newly loaded renderer reconnect after Harness maintenance, and a root `shell.overlay` job card mirrors the existing bottom-right plugin-install presentation. It displays the current scenario and stage, total and remaining rounds, passed and failed counts, and safe cancellation. Hiding the card only hides presentation; it does not cancel the main-process run.

Focused coverage pins catalog validation, serial ownership, isolated cleanup, three-round repetition, active suspension and byte restoration, report redaction, supervisor maintenance resume, the restricted preload bridge, Settings presentation, and theme-aware scrolling. Browser replay and Playwright are not part of this desktop capability's verification lane.
