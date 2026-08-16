# DeepSeek Harness Desktop

English | [中文](README.zh.md)

`@deepseek-ai/dsh-desktop` is the native application host for the existing DeepSeek Harness Web GUI. It starts one local Harness process, waits for its canonical readiness line, and loads that loopback origin in a hardened Electron window. The desktop app does not copy session, provider, plugin, or Skill state into an application-specific format.

## Run from this checkout

The current milestone is a macOS source run. Use Node `^22.19.0 || >=24.0.0`, then build the repository before starting the desktop app:

```sh
pnpm install
pnpm run build
pnpm run dev:desktop
```

The app opens the same onboarding and settings surfaces as `dsh web`. Users can configure DeepSeek or another compatible API provider, choose models, inspect installed plugins, edit supported plugin settings, invoke Skills, select workspaces, and manage sessions without a second configuration store.

## Process lifecycle

The Electron main process starts `node apps/cli/lib/bin.js web --host 127.0.0.1 --port 0` directly, without a shell. It treats only `dsh web: http://127.0.0.1:<port>` as readiness, appends stdout and stderr to Electron's platform log directory, restarts unexpected exits with bounded exponential delay, and sends `SIGTERM` before a bounded `SIGKILL` during application shutdown.

Set `DSH_DESKTOP_DSH_BIN` to test another built `dsh` launcher. Set `DSH_DESKTOP_NODE_BIN` when `node` is not available through the environment inherited by Electron.

## Official source updates

The General settings page exposes **DeepSeek Harness core updates** in desktop source runs. It checks `master` from the fixed official repository `https://github.com/deepseek-ai/deepseek-harness.git`, displays the current and fetched commits, and enables the upgrade action only when the local commit is an ancestor of the official commit and the worktree is clean. A fork that already contains the fetched official commit is current; diverged histories require a manual merge.

A confirmed upgrade fast-forwards the checkout, runs `pnpm install --frozen-lockfile`, and runs the complete repository build through the Node executable selected for the desktop Harness. Dependency and build children receive an environment with credential-bearing variable names removed. A failed preparation resets the checkout to the prior commit and prepares that version again. The result reports an incomplete rollback instead of presenting the old build as healthy when restoration fails. Successful updates require an application restart, offered by the same settings card.

Set `DSH_DESKTOP_SOURCE_ROOT` only when testing a different trusted checkout. The updater never runs for a packaged application without a Git checkout; signed release metadata and installer rollback remain prerequisites for packaged automatic updates.

## Security

The renderer has `nodeIntegration: false`, `contextIsolation: true`, and `sandbox: true`. Navigation is limited to the Harness process's exact loopback origin. New HTTPS windows open in the system browser; every other new window is denied. Renderer permission requests are denied. No privileged Electron API is exposed to Web code.

API keys remain owned by the Harness credentials service. The desktop host neither reads nor duplicates them. The sandboxed preload exposes only update check, confirmed upgrade, and application restart calls; it exposes no generic command or filesystem method.

## Cross-platform release plan

The source host uses only Electron and Node process APIs that are shared by macOS, Windows, and Linux. Installable releases still require platform work:

1. Bundle a reviewed Node runtime and the published Harness dependency closure so installers do not depend on the user's `PATH`.
2. Build and notarize arm64 and x64 macOS artifacts; build signed Windows x64/arm64 installers; build Linux AppImage and deb artifacts on their native CI runners.
3. Exercise shutdown, child cleanup, native directory selection, file opening, PTY, and sandbox behavior on each platform before adding it to the supported matrix.
4. Add signed update metadata only after release signing and rollback are operational.

Do not package the checkout by copying all workspace sources into Electron. The release artifact must contain the published runtime closure, generated third-party notices, and no development credentials.

## Extension direction

Desktop-specific behavior remains outside the agent loop. Plugin and Skill management continue through Harness services and the existing settings UI. Remote control should enter through a transport plugin that maps an authenticated IM conversation to durable Harness session input and sends approval or question responses back through the interaction services. WeChat, Discord, and Slack adapters should be separate provider plugins over that common transport service, with explicit identity mapping, authorization, audit events, rate limits, and revocation.

The next desktop milestones are self-contained packaging, native notifications for approval requests, a tray status surface, deep links, and an authenticated local control endpoint. Embedded browsers, Git panels, terminals, and plugin marketplaces should be added only as client plugins backed by owned Harness services, not Electron-only state.

## Limitations

- The current source run requires a built repository and a compatible Node executable.
- Installer generation, signing, notarization, packaged auto-update, tray behavior, native notifications, and IM control are not implemented. The source updater accepts only a clean fast-forward from official `master`; local divergence stays a manual Git operation.
- macOS is the first locally exercised platform; source compatibility does not yet constitute Windows or Linux release support.
