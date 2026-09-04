// Shared plumbing for the web smoke tests (dist location, free port, failure shots).
import { existsSync, mkdirSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Browser, Locator, Page } from 'playwright'

/** The built page under test; `pnpm run test:web` rebuilds it before running. */
export const DIST_INDEX = fileURLToPath(new URL('../dist/index.html', import.meta.url))

export const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url))

/**
 * Browser language a page must advertise to boot into the product's Chinese
 * surface: with no stored preference the client derives its initial locale
 * from the browser, and Playwright's default browser asks for English.
 */
export const ZH_BROWSER_LOCALE = 'zh-CN'

/**
 * Open the standard browser-test page advertising English before client boot.
 * This keeps role locators and goldens deterministic while leaving the Host
 * settings document free to override the provisional browser-derived locale;
 * scenarios asserting the Chinese surface advertise
 * {@link ZH_BROWSER_LOCALE} instead.
 * @param browser - Playwright browser owning the page.
 * @param height - Viewport height; width is fixed to the lane baseline.
 * @returns the initialized page.
 */
export async function newEnglishPage(browser: Browser, height = 1000): Promise<Page> {
  return await browser.newPage({ viewport: { width: 1680, height }, locale: 'en-US' })
}

/**
 * Expand every currently eligible Turn-process group so a Tool-focused
 * scenario can exercise the original row contract beneath product-default
 * compact Chat presentation.
 * @param page - page containing the Chat view.
 */
export async function expandTurnProcesses(page: Page): Promise<void> {
  const controls = page.locator('[data-turn-process]')
  await controls.first().waitFor({ state: 'visible', timeout: 10_000 })
  const count = await controls.count()
  for (let index = 0; index < count; index++) {
    const control = controls.nth(index)
    if (await control.getAttribute('aria-expanded') !== 'true') await control.click()
  }
}

/**
 * Expand the Turn-process group containing one possibly hidden descendant.
 * @param page - page containing the Chat view.
 * @param target - descendant whose owning Turn process should open.
 */
export async function expandOwningTurnProcess(page: Page, target: Locator): Promise<void> {
  const turn = await target.evaluate(element => element.closest<HTMLElement>('[data-chat-turn]')?.dataset.chatTurn)
  if (turn === undefined || await target.isVisible()) return
  const control = page.locator(`[data-turn-process="${turn}"]`)
  await control.waitFor({ state: 'visible', timeout: 10_000 })
  if (await control.getAttribute('aria-expanded') !== 'true') await control.click()
}

/** Fail loud on a stale checkout instead of testing yesterday's bundle. */
export function requireDist(): void {
  if (!existsSync(DIST_INDEX)) {
    throw new Error('web app dist not built — run `pnpm run build` from the repository root (`pnpm run test:web` does this first)')
  }
}

/** OS-assigned free port, released before use (the spawned `dsh web` needs a concrete --port). */
export function probeFreePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const probe = createServer()
    probe.once('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address()
      if (address === null || typeof address === 'string') {
        probe.close(() => { reject(new Error('port probe returned no address')) })
        return
      }
      probe.close(() => { resolvePort(address.port) })
    })
  })
}

/**
 * Drive the hero's workspace picker through the composed directory dialog
 * until the live composer unlocks. A fresh world has no Workspace, so the boot
 * lands in the Workspace-trigger view state (startup auto-selection has nothing to
 * select); every scenario that types into the composer must connect one
 * first. With nothing to list, activating the composer surface raises the dialog directly —
 * adding a workspace is the picker's only entry. The directory is staged here
 * and adopted through the path editor, which is idempotent across the repeated
 * connects a scenario may make; creating a folder from inside the dialog (the
 * product's other half of the same route) is covered by
 * workspace-management.e2e.ts. The default name 'workspace' keeps the session
 * header cwd at <root>/workspace, the materialization proof several scenarios
 * assert.
 * @param page - the page under test.
 * @param root - host directory the workspace folder is staged in (the scaffold's `workspaceCwd`).
 * @param name - folder name staged and adopted as the workspace.
 */
export async function connectFreshWorkspace(page: Page, root: string, name = 'workspace'): Promise<void> {
  mkdirSync(join(root, name), { recursive: true })
  await page.getByRole('textbox', { name: 'Choose workspace' }).click()
  const dialog = page.getByRole('dialog', { name: 'Select Workspace Directory' })
  await dialog.waitFor({ timeout: 10_000 })
  await dialog.getByRole('button', { name: 'Edit path' }).click()
  const pathInput = dialog.getByRole('textbox', { name: 'Edit path' })
  await pathInput.fill(join(root, name))
  await pathInput.press('Enter')
  await dialog.getByRole('button', { name: 'Open', exact: true }).click()
  // The pick connected the workspace: the blank session's live composer
  // replaces the locked placeholder and enables.
  await page.locator('[data-composer-input][contenteditable="true"][data-placeholder="Describe what you want to build... / commands, @ files or sessions"]')
    .waitFor({ timeout: 15_000 })
}

/**
 * {@link connectFreshWorkspace} over a page that advertises
 * {@link ZH_BROWSER_LOCALE}: the English helper's anchors assume the locale
 * most other scenarios boot, so a scenario that deliberately keeps zh needs
 * the localized picker copy.
 * @param page - the browser page under test.
 * @param root - workspace parent directory.
 * @param name - directory created under `root` and connected.
 */
export async function connectFreshWorkspaceZh(page: Page, root: string, name = 'workspace'): Promise<void> {
  mkdirSync(join(root, name), { recursive: true })
  await page.getByRole('textbox', { name: '选择工作区' }).click()
  const dialog = page.getByRole('dialog', { name: '选择工作区目录' })
  await dialog.waitFor({ timeout: 10_000 })
  await dialog.getByRole('button', { name: '编辑路径' }).click()
  const pathInput = dialog.getByRole('textbox', { name: '编辑路径' })
  await pathInput.fill(join(root, name))
  await pathInput.press('Enter')
  await dialog.getByRole('button', { name: '打开', exact: true }).click()
  await page.locator('[data-composer-input][contenteditable="true"][data-placeholder="描述你想要构建的内容… / 调用指令 @ 文件或对话"]')
    .waitFor({ timeout: 15_000 })
}

/**
 * Replace the composer draft through per-key gestures. `fill()` issues
 * select-all and insertText inside one task; directly after a trigger-menu or
 * chip interaction Lexical's internal selection has not yet absorbed the DOM
 * selection, and the batched edit lands on a null selection and is silently
 * dropped, leaving the previous draft in place. Real keystrokes leave room for
 * `selectionchange` between keys, which is also what a user's typing does.
 *
 * Waits for the surface to be editable first. While the input machine is
 * adjudicating or submitting a send — and in every locked state (removed
 * session, no workspace, an owner block) — the composer renders read-only
 * with `contenteditable="false"` on the same element. `fill()` throws
 * immediately on that element, and `isEnabled()` reports `true` for a
 * `<div>` regardless of the attribute — so a gesture directly after a
 * submit must gate on the attribute, not on enablement. A running turn by
 * itself keeps the composer editable (that is what queueing types into).
 * @param page - the page under test.
 * @param input - the `[data-composer-input]` surface locator.
 * @param text - the replacement draft; `''` clears the draft. Must not
 * contain a newline: typed Enter submits the composer.
 */
export async function writeComposerDraft(
  page: Page,
  input: ReturnType<Page['locator']>,
  text: string,
): Promise<void> {
  await input.and(page.locator('[contenteditable="true"]')).waitFor({ timeout: 15_000 })
  await input.click()
  await page.keyboard.press('ControlOrMeta+A')
  if (text === '') await page.keyboard.press('Backspace')
  else await page.keyboard.type(text)
}

/**
 * Evidence directory for diagnostic rounds: the temporary workflow pins an
 * absolute runner path through `DSH_CHAT_DIAG_DIR`; local runs fall back to
 * the gitignored repo `.artifacts/`.
 */
function diagDir(): string {
  return process.env.DSH_CHAT_DIAG_DIR
    ?? fileURLToPath(new URL('../../../.artifacts', import.meta.url))
}

/** Diagnostic rounds only: per-label record buffers, rewritten on every flush. */
const diagRecords = new Map<string, object[]>()

/**
 * Drain the page-side diagnostic ring into `<diagDir>/<label>.json`. The
 * browser context only collects; this Node host owns the file. Every outcome
 * is logged so a runner-side gap explains itself, and an empty ring still
 * lands a manifest record — which distinguishes "no taps fired" from
 * "evidence channel broken". Best-effort: never throws into a failure path.
 * @param page - the page under test.
 * @param label - scenario label for the file name.
 */
export async function flushDiag(page: Page, label: string): Promise<void> {
  try {
    const drained = await page.evaluate(() => {
      const w = window as unknown as { __dshDiag?: string[] }
      const present = Array.isArray(w.__dshDiag)
      const lines = w.__dshDiag ?? []
      w.__dshDiag = []
      return { present, lines }
    })
    const records = diagRecords.get(label) ?? []
    for (const line of drained.lines) {
      try {
        records.push(JSON.parse(line) as object)
      } catch {
        records.push({ event: 'unparseable', raw: line })
      }
    }
    diagRecords.set(label, records)
    const dir = diagDir()
    await mkdir(dir, { recursive: true })
    const path = join(dir, `${label}.json`)
    const payload = { label, ringPresent: drained.present, records }
    await writeFile(path, `${JSON.stringify(payload, null, 1)}\n`)
    if (!drained.present || records.length === 0) {
      console.warn(`[diag] ${label}: ring present=${String(drained.present)} records=${String(records.length)} → ${path}`)
    } else {
      console.log(`[diag] ${label}: ${String(records.length)} record(s) → ${path}`)
    }
  } catch (error) {
    console.error(`[diag] ${label}: flush failed — ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * Drop a case mark into the page-side diagnostic ring so one combined
 * timeline can be segmented by scenario phase. Diagnostic rounds only.
 * @param page - the page under test.
 * @param name - mark name recorded with the ring's monotonic timestamp.
 */
export async function markDiag(page: Page, name: string): Promise<void> {
  await page.evaluate((mark) => {
    const w = window as unknown as { __dshDiag?: string[]; __dshDiagLabel?: string }
    w.__dshDiag ??= []
    w.__dshDiag.push(JSON.stringify({ t: Math.round(performance.now()), label: w.__dshDiagLabel ?? 'unlabeled', event: 'mark', mark }))
  }, name)
}

/**
 * Failure evidence lands beside the diagnostics in the diag directory.
 * Full-page first, viewport fallback: a runner-side full-page capture
 * failure must not cost the only visual record, and every attempt is
 * logged. Best-effort: never throws into a failure path.
 * @param page - the page under test.
 * @param name - file stem for the screenshot.
 */
export async function saveFailureShot(page: Page, name: string): Promise<void> {
  const path = join(diagDir(), `${name}.png`)
  try {
    await page.screenshot({ path, fullPage: true })
    return
  } catch (error) {
    console.error(`[diag] ${name}: full-page screenshot failed — ${error instanceof Error ? error.message : String(error)}`)
  }
  try {
    await page.screenshot({ path, fullPage: false })
    console.warn(`[diag] ${name}: fell back to a viewport screenshot`)
  } catch (error) {
    console.error(`[diag] ${name}: viewport screenshot failed — ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * The conversation engine's Context key format, restated here rather than
 * imported: these specs live in the Host compiler aggregate, which must not
 * reach the Client plane. The engine's own copy is
 * `conversationContextKey` in ui-conversation; a drift between them makes
 * the key miss its rendered node, so the assertion fails loudly.
 * @param kind - Definition kind.
 * @param id - Definition-local business identity.
 * @returns the engine-owned Context key.
 */
export function conversationContextKey(kind: string, id: string): string {
  return `${kind.length}:${kind}${id}`
}
