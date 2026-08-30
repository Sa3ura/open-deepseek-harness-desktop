# Agent Note: Bound community desktop Release discovery

Status: implemented

English | [中文](2026-08-30-bounded-community-release-discovery.zh.md)

## Problem

The desktop Release checker treated the upstream-style `dsh-v` prefix and one prerelease label as the complete release identity. A community `odsh-v` tag was therefore invisible, and an installed release candidate could not discover a higher alpha version. A stalled GitHub request also left the settings action in its checking state without a recovery point.

## Decision

Desktop Release discovery accepts the community `odsh-v` prefix, the legacy `dsh-v` prefix, and a plain `v` prefix before parsing semantic versions. Stable clients reject every semantic prerelease, including a release that GitHub incorrectly marks as regular. Any prerelease client accepts a higher semantic prerelease regardless of its label and also accepts a higher stable version.

The Release metadata request has a fifteen-second deadline and aborts its HTTP operation when the deadline expires. The stateful checker converts that failure into its existing visible error state and allows a later retry.

The desktop package workflow publishes new community tags under `odsh-v*` and continues to accept legacy `dsh-v*` tags. It derives prerelease status from the semantic version and applies the same title and status when it creates or updates a GitHub Release.

## Alternatives considered

**Rename the published community Release to `dsh-v*`.** This would make one Release visible to old clients but would keep community and upstream tag identities ambiguous and would not repair stalled requests or future channel transitions.

**Require prerelease label equality.** Keeping rc, alpha, and beta as isolated channels prevents a client on the previous product baseline from seeing the next published preview. Semantic precedence already determines whether the candidate is newer, while stable clients retain the stricter exclusion rule.

**Trust GitHub's prerelease flag alone.** A manually created Release can carry an alpha semantic version while GitHub marks it as regular. Parsing the tag protects stable clients even when the hosting metadata is inconsistent.

## Consequences

The packaged rc.2 client can discover the community alpha.1 Release, the alpha.1 client recognizes itself as current, and future `odsh-v*` Releases use one release identity across discovery and CI publication. A GitHub outage or blocked connection becomes a retryable error after fifteen seconds instead of an indefinite spinner. Legacy desktop tags remain discoverable and publishable during the transition.
