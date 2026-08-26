# Agent Note: Profile build approval retry

Status: implemented

English | [中文](2026-08-24-profile-git-build-approval-retry.zh.md)

## Problem

pnpm requires an `allowBuilds` rule before a dependency may run a lifecycle script. Git-hosted plugins need a resolution-specific dependency-path key, while reviewed registry dependencies use their package name. A user who explicitly installed a reviewed plugin through the market or CLI still received a failed operation and a manual YAML instruction. Large pnpm diagnostics also placed the exact Git key before a long stack, while dsh retained only the final 64 KiB, so the exported market log could omit the value the instruction required. Packaged Better Sidebar additionally depended on `node-pty`, so its deferred installation failed after the application was already ready.

## Decision

An explicit profile `add` retains the exact dependency-path key from pnpm's structured Git-prepare hint before diagnostic truncation. dsh appends that bounded fact to the retained diagnostic, atomically adds only the exact key with value `true` to the profile's `pnpm-workspace.yaml`, and retries the same operation once.

The desktop bundled-plugin manifest may separately name reviewed registry dependencies in `approvedBuilds`. Before installing that exact bundled entry, both the host and the Windows packaged-runtime smoke call `dsh plugin --profile <name> approve-build <package-name>`. The CLI validates an unversioned npm package name and writes only that key. Better Sidebar declares only `node-pty`; ordinary market and CLI installs receive no implicit registry approval.

Both YAML update paths preserve comments and unrelated settings. An existing `false` rule remains authoritative. Missing, malformed, duplicate, or unrelated approvals do not modify the profile, and dsh never enables every build script. A Git retry failure includes the original failure and the retry diagnostic.

## Alternatives considered

**Require every user to edit the profile YAML.** This preserves a separate approval step, but the plugin market already requires an explicit trust confirmation and packaged users should not need to recover an internal dependency-path key from pnpm output. Diagnostic truncation can make the procedure impossible.

**Enable all dependency build scripts.** This avoids future Git-prepare failures but discards pnpm's deny-by-default protection for unrelated and transitive packages.

**Allow the manifest name and version shown in the human error.** pnpm authorizes Git preparation against its resolution-specific dependency path, not the display version. A broader or reconstructed key can fail to match and can survive a source revision change unintentionally.

**Disable strict dependency-build checks for bundled plugins.** This would let any transitive lifecycle script execute. The manifest allowlist instead records the reviewed package name and leaves every other script blocked.

## Consequences

Installing a reviewed Git source plugin can execute its declared preparation script after the first blocked attempt, and the exact source resolution remains visible in the profile configuration. A changed Git resolution receives its own rule. A packaged plugin can run only the registry lifecycle dependencies named in its integrity-checked bundled manifest; explicit denials still win, and unrelated registry archives, local checkouts, and non-`add` package-manager operations keep their existing behavior.

Focused tests use pnpm's real local-Git preparation path, retain a key across an oversized diagnostic, validate registry package names, preserve YAML comments, and pin explicit-denial behavior. Windows package smoke testing installs deferred Better Sidebar through packaged Node and pnpm and therefore rejects a missing `node-pty` approval.
