# Agent Note: Web Chat flow virtualization

Status: implemented

English | [中文](2026-09-03-web-chat-virtualization.zh.md)

## Problem

The Chat transcript mounts one React row per loaded Conversation node, so mounted rows, DOM nodes, and layout work grow linearly with the loaded history window. Long tool-heavy sessions keep thousands of hidden-but-mounted rows alive (a folded Turn process keeps its member rows in the DOM under `hidden="until-found"`), and scrolling plus streaming degrade as the transcript grows. Session paging already bounds what enters the client window; nothing bounded how much of that window stays mounted.

## Decision

`ui-chat` windows the loaded Chat flow through the repository's existing `@tanstack/react-virtual` dependency. Below `CHAT_VIRTUALIZATION_THRESHOLD` rows (100, mirroring the trajectory ledger's convention) the plain full-map path renders unchanged; above it, `ChatNodeList` renders only the virtualizer's viewport-plus-overscan items between two height spacers, so mounted seats stay approximately bounded by the viewport instead of scaling with loaded history.

The separation of ownership is the core of the design:

- **TanStack Virtual owns** the visible range, per-row measurement, item offsets, and scroll-to-offset arithmetic. `getItemKey` returns the stable Conversation Context key (`conversationContextKey(kind, id)`), so TanStack's size cache is keyed by logical identity and survives prepends; `measureElement` reads each seat's border box, and the virtualized path moves the sibling flow gap inside each row as top padding (`ChatView.module.css` gates both spacing models on `data-chat-flow-virtual`) so measured sizes carry the spacing and offsets never drift by rowCount × gap. TanStack's own scroll write — the above-the-fold measurement compensation it performs by default through `scrollToFn` (first measures and fully-above-fold re-measures) — is explicitly disabled via `shouldAdjustScrollPositionOnItemSizeChange: () => false`: the plain Chat path never compensated size changes, so disabling preserves pre-virtualization reader semantics, keeps ChatView the only `scrollTop` writer, and prevents the compensation from stacking with the prepend correction. `scrollMargin` is published as row 0's true content offset (the flow column's origin inside the scroll content plus the leading blocks' height), so virtualizer offsets and `scrollTop` share one coordinate system.
- **`ChatView` remains the single scroll authority.** Bottom follow (`atBottomRef` + column `ResizeObserver` + flow-tip signature), reader/programmatic scroll discrimination (`observedTopRef`), prepend anchors (`PagingAnchor`), the load-through jump state machine, session scroll restore (`chatScroll`), and back-to-bottom are untouched. The streaming row's growth reaches the virtualizer as an ordinary row resize whose re-measure adjusts offsets only; whether the viewport moves remains ChatView's decision, exactly as on the plain path.

Prepend correction stays in `ChatView` and uses the virtualizer only for offset arithmetic. TanStack's automatic prepend compensation is bound to `anchorTo: 'end'` and therefore inactive under the default start anchoring, and with measurement compensation disabled nothing else writes `scrollTop` beside ChatView. The anchored-prepend branch writes the anchor's *absolute* new offset (`offsetOfKey(anchorKey) − anchorTop`) — coordinate-exact because `scrollMargin` carries the column origin; the mounted-row rectangle path remains the primary correction whenever the anchor row is mounted, as it always is in the load-earlier flow. Jump navigation resolves a target key to `order.indexOf → offsetOfKey` when its row is unmounted; unloaded Turns still page through the existing `loadThrough()` state machine.

Virtualization unmounts offscreen seats, so renderer-local disclosure state that must survive the unmount moved into session-scoped stores — one `createChatNodeStore()` in `ui-chat` (node-qualified keys for system-prompt, context injection, command cards, and per-block reasoning rows) and one `createToolDisclosureStore()` in `ui-tool` (per call id), both following the existing store-at-register pattern (`createChatStore`, turn-process entries); entries hold booleans where only `true` means expanded. `ModelRetryItem`'s native `<details>` and text selection are accepted losses recorded in the package README.

## Alternatives considered

**Let TanStack own bottom-follow via `anchorTo: 'end'` + `followOnAppend` + `scrollToEnd()`.** Rejected for Phase 1: ChatView's follow model already distinguishes reader scrolls from programmatic writes, keeps streaming pinned with a 24px threshold, and survives inertial scrolls without snapping; a second scroll writer would race it on every measurement change and re-litigate the scroll-contract behaviors covered by `chat-scroll-contract.e2e.ts`. The trajectory ledger can use end-anchoring because it owns its own scroll pane with fixed row heights; Chat rows are unbounded in height.

**Reuse the trajectory pattern's constant `estimateSize` without DOM measurement.** Rejected: trajectory rows are single-line table rows (30/20/9px constants); Chat rows range from one line to multi-thousand-pixel Markdown, so estimates without `measureElement` would misplace every row after the first tall one.

**Introduce a chat-specific virtualization library (react-virtuoso) with built-in follow.** Rejected: it would add a second list engine beside the repository's established TanStack usage for a feature (`follow`) ChatView already owns, and the client module-graph/bundling rules make every new external row a shared-module decision.

**Persist per-row height caches across Sessions.** Rejected for Phase 1: sessions re-measure on remount; cross-session caches risk stale heights after reconnect-replace and are unjustified without measurement.

## Consequences

Mounted Chat seats stay bounded by viewport + overscan once the flow exceeds 100 rows; `apps/web/tests/chat-virtualization.e2e.ts` pins the bound (≤80 seats above 1000 logical rows), prepend anchor drift (±2px), pinned streaming, scroll-away ownership, tool disclosure persistence across unmount/remount, session A→B→A, and resize, while `complex-history.perf.ts` reports logical-vs-mounted rows alongside DOM/heap for the 500-turn world. Offscreen rows are genuinely absent from the DOM: native Ctrl+F and text selection cover only the mounted window (stated in `ui-chat`'s Known Limitations, not silently regressed), and `hidden="until-found"` discoverability now applies within the mounted window. Row state that must survive unmounting lives in the two new session-scoped stores; entries die with the Session scope and grow only with reader interactions.
