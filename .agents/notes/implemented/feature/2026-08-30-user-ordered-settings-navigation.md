# Agent Note: User-ordered settings navigation

Status: implemented

English | [中文](2026-08-30-user-ordered-settings-navigation.zh.md)

## Problem

Settings sections are contributed dynamically by independent plugins. Their canonical registration order is useful as a default, but a long installation can make frequently used pages inconvenient to reach. Using labels or array positions as a preference would break when the locale changes or a plugin is removed.

## Decision

The settings shell gives every section row a dedicated three-line reorder handle and an equivalent Up/Down keyboard interaction. Pointer capture arms only from the handle; after a four-pixel threshold, a fixed full-row ghost follows the pointer while measured sibling rows translate into the vacated slot. Edge scrolling keeps long rails reachable. Commit waits for the 180ms settle transition and writes the final order once; outside release, Escape, and pointer cancellation animate back without writing. Theme label tokens make the insertion line black in light mode and white in dark mode, while reduced-motion preferences remove the transition.

It persists the resulting stable `settings.section` ids in the Host-owned `ui-settings-navigation.sectionOrder` setting. Selection remains a separate button, so ordinary page navigation cannot accidentally begin a drag.

The persisted order overlays the live slot ledger rather than mutating it. Known ids appear in the user's order, newly registered ids append in canonical ledger order, and temporarily absent ids remain in the durable list for a possible reinstall. Empty and duplicate durable ids are ignored at projection time.

## Alternatives considered

**Change each plugin's registration order.** This would turn a per-user preference into shared plugin policy and would require coordinated writes across independently owned packages.

**Store labels or visible indexes.** Labels are localized and indexes move whenever a plugin appears or disappears, so either choice can silently reorder the wrong page.

**Use browser local storage.** That would bypass the existing settings document, separate the preference from the selected desktop data home, and make import/reuse behavior inconsistent with other UI preferences.

## Consequences

Users can arrange a long settings rail around their own workflow with pointer or keyboard input, see every crossed item make room before release, and retain the order through the selected settings provider. Dynamic plugin registration still works without migrations. The cost is one small durable namespace, temporary pointer geometry while sorting, and an overlay step whenever the settings ledger changes; the canonical registration order remains the fallback and source for new rows.
