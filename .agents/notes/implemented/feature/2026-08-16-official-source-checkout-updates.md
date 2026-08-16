# Agent Note: Official source checkout updates

Status: implemented

English | [中文](2026-08-16-official-source-checkout-updates.zh.md)

## Problem

The desktop source run had no product path for discovering or applying stable Harness changes from the official repository. Running an unrestricted pull from the renderer would grant command execution to Web content, overwrite unfinished work, and leave a checkout or built runtime partially updated when installation failed.

## Decision

The Electron host owns a narrow source updater. Its upstream is fixed to `https://github.com/deepseek-ai/deepseek-harness.git` and its stable branch is `master` until the official project publishes a separate stable release channel. The preload exposes only check, upgrade by an exact 40-character commit, and restart operations.

Check fetches the branch into `FETCH_HEAD` without moving the current branch. The status distinguishes current, ready, dirty, diverged, non-checkout, and failed checks. A ready update requires a clean worktree and a strict fast-forward from the current commit to the fetched commit. A fork that contains the official commit is current, while divergent commits require a manual merge.

Upgrade fetches and verifies the expected commit again, fast-forwards, installs the frozen lockfile, and performs a complete build. Installation and build receive no inherited environment variable whose name contains `KEY`, `SECRET`, `TOKEN`, or `PASSWORD`. Preparation failure resets to the recorded prior commit and prepares it again; failure of either rollback step remains visible. The app restarts only through a separate explicit action after success.

The settings General page registers the update card only when the Electron preload bridge exists. It shows the official source, branch and short commits, explains every blocked state, and confirms the dependency scripts that a source update runs. Ordinary Web clients receive no updater control.

## Alternatives considered

- **Expose a generic Electron process bridge:** rejected because any renderer compromise would gain arbitrary command execution and filesystem access.
- **Merge divergent branches automatically:** rejected because conflict resolution and custom downstream changes require repository-specific review; a one-click updater cannot preserve their intent safely.
- **Update packaged applications from Git:** rejected because an installer needs signed artifacts, release metadata, atomic replacement, and platform rollback rather than a mutable development checkout.
- **Move the branch before installation without rollback:** rejected because a failed dependency or build step would leave the selected version unusable.

## Consequences

Desktop source users can discover and apply official fast-forward updates from Settings without exposing a general native bridge. Local edits and downstream divergence stop the operation before source mutation. The feature intentionally does not update packaged releases and treats official dependency scripts as trusted code only after explicit confirmation.
