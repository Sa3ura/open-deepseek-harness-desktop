# Agent Note: First-run DeepSeek connection setup

Status: implemented

English | [中文](2026-08-16-first-run-deepseek-connection-setup.zh.md)

## Problem

The first-run DeepSeek step accepted only an API key even though the Models page already supported an alternate `baseURL` and a deployment-owned model catalog. A user of a compatible gateway had to dismiss onboarding, find Settings, and repeat the provider setup before the first session.

## Decision

The first-run step renders the same DeepSeek `ProviderEditor` used by Settings, with endpoint and model controls initially open. An unchanged endpoint and catalog resolve to `https://api.deepseek.com` and the adapter defaults. Editing either value writes the existing `llm-deepseek` settings section, so the next provider request observes it without an application restart.

The API key remains required for this official adapter flow and travels only through `credentials.set`. Endpoint and model values travel through `settings.mutate`; neither the UI snapshot nor `settings.yaml` receives the key. The Models page remains the post-onboarding entry for replacing the key, endpoint, or catalog.

## Alternatives considered

- **Keep onboarding key-only and link to Settings:** rejected because a custom endpoint would still require two configuration passes before the product is usable.
- **Create a separate onboarding form:** rejected because validation, redaction, partial-write behavior, and model editing would diverge from the Models page.
- **Store the key beside the endpoint in settings:** rejected because the credential service is the existing write-only secret owner and settings descriptors are intentionally inspectable and redacted.

## Consequences

Official DeepSeek users can enter only a key, while gateway users can configure a compatible API URL and arbitrary model IDs during the same first-run step. The larger dialog scrolls on short viewports and keeps the settings disclosure open initially. Unit tests cover default and custom submissions; the keyless Web scenario records the expanded first-run state and proves separate settings and credential persistence.
