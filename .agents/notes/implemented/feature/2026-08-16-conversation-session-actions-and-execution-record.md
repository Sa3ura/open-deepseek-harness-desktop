# Agent Note: Conversation Session actions and execution record

Status: implemented

English | [中文](2026-08-16-conversation-session-actions-and-execution-record.zh.md)

## Problem

The conversation Header had no direct Session-level copy or lifecycle controls. Per-message Copy existed, but exporting the visible exchange required repeated gestures. Users also needed clear and delete actions without a UI-only implementation that hid rows while leaving the same model context active. The Trajectory tab contained detailed durable events, but its name and first screen did not directly answer what the agent actually executed.

## Decision

The Header utilities provide one-click copying of the loaded user and assistant transcript plus a Session menu. Copy excludes reasoning content, includes the visible streaming assistant tail, and names itself as loaded-window copy because earlier paged history may remain outside the client projection.

Clear and Delete use the existing Workspace archive operation. Clear archives the current Session and starts a blank Session in the same Workspace when possible. Delete removes the Session from client lists. Both require confirmation, are unavailable while the agent runs, and state that the append-only log remains in local storage. Neither action removes rendered nodes while continuing the same Session.

The Trajectory tab opens with a Key step record strip that summarizes the loaded turn count, tool-call count, failed operations, and running or recorded state. Its copy identifies the Session log as the source; the existing timeline, ledger, and inspector remain the detailed evidence.

## Alternatives considered

- **Delete individual message rows in React state:** rejected because the model, replay, fork, export, and query paths would still consume the durable event.
- **Physically delete the Session log:** deferred because safe erasure requires one coordinated capability across live Session retirement, JSONL and SQLite providers, Workspace accounting, descendants, attachments, and read projections.
- **Create a separate activity store for key steps:** rejected because tool and turn events are already durable and are the authoritative execution record.

## Consequences

The common conversation workflow now has fast loaded-transcript copy, confirmed clear, and confirmed removal actions. Clear produces a genuinely blank follow-up Session instead of retaining hidden context. Delete currently means list removal with retained audit data, and the dialog makes that limitation explicit. Trajectory now surfaces an immediate audit summary while retaining the full event ledger for inspection.
