# @deepseek-ai/dsh-client-ui-selection-actions

English | [中文](README.zh.md)

Contextual selected-text actions for the Web and Electron conversation surface. A primary-button selection inside the conversation or details columns opens a compact horizontal toolbar; right-clicking the same eligible selection opens a vertical rounded menu. Both surfaces provide Copy, Ask in new conversation, and Add to current conversation.

The package listens at the document boundary but accepts only a range wholly contained by an explicit `data-selection-actions-scope` region. Inputs, editors, buttons, links, dialogs, menus, settings portals, and the sidebar remain outside the feature. The immutable text and range rectangle are captured before the popup takes interaction, and pointer-down on an action preserves the browser selection until the command has read it.

Ask in new conversation resolves the selected session's Workspace, connects its provisional blank session, writes a localized Markdown-quoted draft, and opens it without sending. Add to current conversation appends a Markdown quote after the existing draft. It is omitted whenever the current composer is unavailable, busy, blocked, removed, waiting for a DSH interaction, or attached to an unavailable continuable parent. Copy remains available without a Workspace.

Both popup forms use shared semantic theme tokens and therefore follow every light and dark theme. Escape, an outside pointer press, a collapsed selection, navigation, scrolling, and resizing dismiss the surface.

## Model Experience

None, as browser-side draft controls keep selected text out of model context until the human submits the resulting draft.

#### KV Cache effect

None; the package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- Touch long-press selection is not handled; the first version targets mouse and trackpad interaction on desktop Web and Electron surfaces.
- The action list is fixed. A third-party action registry is deferred until there is a concrete extension consumer and permission model.
