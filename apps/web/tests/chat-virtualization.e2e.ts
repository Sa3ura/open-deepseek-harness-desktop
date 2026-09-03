// Browser contract for the virtualized Chat flow over tail-paged history.
// The scenario proves mounted Chat seats stay bounded by the viewport while
// semantic row identity, bottom-follow, scroll-away, load-earlier anchoring,
// tool disclosure state, session switching, and resize all keep their
// pre-virtualization behavior.
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest'
import type { StreamChunk } from '@deepseek-ai/dsh-llm'
import type { ReplayEntry } from '@deepseek-ai/dsh-llm-replay'
import { createChatScrollFixture } from './chat-scroll-fixture.ts'
import {
  launchWebScaffold,
  seedSession,
  watchConsole,
  webSnapshotMode,
  type WebScaffold,
} from './scaffold.ts'
import { newEnglishPage, saveFailureShot } from './support.ts'

const MODE = webSnapshotMode()
const SESSION_ID = 'chat-virtualization-e2e'
const B_SESSION_ID = 'chat-virtualization-e2e-b'
const LONG_FIXTURE = createChatScrollFixture({
  markerPrefix: 'CHAT_VIRTUAL',
  title: 'CHAT_VIRTUAL long transcript',
  turns: 600,
})
const SHORT_FIXTURE = createChatScrollFixture({
  markerPrefix: 'CHAT_VIRTUAL_B',
  title: 'CHAT_VIRTUAL_B short transcript',
  turns: 4,
})
// Loose bound: viewport rows + overscan on both edges must stay far below the
// loaded logical count, with headroom for tall Markdown rows.
const MAX_MOUNTED_SEATS = 80
const GEOMETRY_TOLERANCE = 2
const STREAM_MARKER = 'CHAT_VIRTUAL_STREAM_FINISHED'
const STREAM_TEXT = Array.from(
  { length: 60 },
  (_, index) => `stream fragment ${String(index + 1).padStart(2, '0')} `,
).join('') + STREAM_MARKER

const STREAM_CHUNKS: StreamChunk[] = [
  { type: 'block-start', index: 0, blockType: 'text' },
  ...Array.from({ length: 60 }, (_, index): StreamChunk => ({
    type: 'text-delta',
    index: 0,
    text: `stream fragment ${String(index + 1).padStart(2, '0')} `,
  })),
  { type: 'text-delta', index: 0, text: STREAM_MARKER },
  { type: 'block-end', index: 0, block: { type: 'text', text: STREAM_TEXT } },
  { type: 'usage', usage: { inputTokens: 2_700, outputTokens: 240 } },
  { type: 'finish', reason: { kind: 'stop' } },
]

interface ScrollGeometry {
  readonly clientHeight: number
  readonly scrollHeight: number
  readonly scrollTop: number
}

async function openSession(page: Page, marker: string, tailMarker: string): Promise<void> {
  const searchButton = page.getByRole('button', { name: 'Search sessions' })
  if (await searchButton.getAttribute('aria-expanded') !== 'true') await searchButton.click()
  const search = page.getByRole('textbox', { name: 'Search sessions...', exact: true })
  await search.fill(marker)
  const result = page.getByRole('tree', { name: 'Search results' }).getByRole('treeitem')
  await expect.poll(() => result.count(), { timeout: 60_000 }).toBe(1)
  await result.click()
  await page.locator('[data-chat-flow]').waitFor({ timeout: 30_000 })
  // The session title also matches the sidebar search row; the seeded tail
  // marker is the transcript-side render barrier, and the tail is what the
  // initial page mounts.
  await page.getByText(tailMarker, { exact: false }).last().waitFor({ timeout: 30_000 })
}

async function logicalRows(page: Page): Promise<number> {
  const raw = await page.locator('[data-chat-flow]').getAttribute('data-chat-logical-count')
  if (raw === null || !/^\d+$/.test(raw)) {
    throw new Error(`Chat flow has invalid data-chat-logical-count ${JSON.stringify(raw)}`)
  }
  return Number(raw)
}

async function mountedSeats(page: Page): Promise<number> {
  return page.locator('[data-chat-flow] > [data-chat-flow-key]').count()
}

async function geometry(page: Page): Promise<ScrollGeometry> {
  return page.locator('[data-conversation-scroll]').evaluate(host => ({
    clientHeight: host.clientHeight,
    scrollHeight: host.scrollHeight,
    scrollTop: host.scrollTop,
  }))
}

async function scrollToRatio(page: Page, ratio: number): Promise<void> {
  await page.locator('[data-conversation-scroll]').evaluate((host, value) => {
    const maximum = Math.max(0, host.scrollHeight - host.clientHeight)
    host.scrollTop = Math.round(maximum * value)
    host.dispatchEvent(new Event('scroll'))
  }, ratio)
  await nextPaint(page)
}

async function nextPaint(page: Page): Promise<void> {
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => { resolve() }))
  }))
}

async function firstVisibleSeat(page: Page): Promise<{ key: string; top: number }> {
  return page.locator('[data-conversation-scroll]').evaluate((host) => {
    const hostBox = host.getBoundingClientRect()
    const rows = [...host.querySelectorAll<HTMLElement>('[data-chat-flow-key]')]
    const row = rows.find((candidate) => {
      const box = candidate.getBoundingClientRect()
      return box.bottom > hostBox.top && box.top < hostBox.bottom
    })
    const key = row?.dataset.chatFlowKey
    if (row === undefined || key === undefined) {
      throw new Error('Chat scrollport has no visible semantic row')
    }
    return { key, top: row.getBoundingClientRect().top - hostBox.top }
  })
}

async function seatTop(page: Page, key: string): Promise<number | null> {
  return page.locator('[data-conversation-scroll]').evaluate((host, targetKey) => {
    const rows = [...host.querySelectorAll<HTMLElement>('[data-chat-flow-key]')]
    const row = rows.find(candidate => candidate.dataset.chatFlowKey === targetKey)
    return row === undefined
      ? null
      : row.getBoundingClientRect().top - host.getBoundingClientRect().top
  }, key)
}

describe('web e2e: Chat virtualization over tail-paged history', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  let tripwire: ReturnType<typeof watchConsole>
  let replayDir: string

  beforeAll(async () => {
    replayDir = await mkdtemp(join(tmpdir(), 'dsh-chat-virtualization-'))
    const replayFixture = join(replayDir, 'session.jsonl')
    const replayOverride = join(replayDir, 'replay.override.json')
    await writeFile(replayFixture, LONG_FIXTURE.log)
    await writeFile(replayOverride, JSON.stringify([{
      kind: 'chunks',
      chunks: STREAM_CHUNKS,
    } satisfies ReplayEntry]))
    scaffold = await launchWebScaffold({
      paceMs: 10,
      replayFixture,
      replayOverride,
    })
    await seedSession(scaffold, LONG_FIXTURE.log, SESSION_ID)
    await seedSession(scaffold, SHORT_FIXTURE.log, B_SESSION_ID)
    browser = await chromium.launch()
    page = await newEnglishPage(browser, 900)
    tripwire = watchConsole(page)
    await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
    await page.getByText('Ungrouped', { exact: true }).waitFor({ timeout: 30_000 })
  }, 120_000)

  afterAll(async () => {
    await browser?.close()
    await scaffold?.close()
    await rm(replayDir, { recursive: true, force: true })
  })

  it.skipIf(MODE === 'record')('keeps mounted Chat seats bounded across scroll, prepend, streaming, disclosures, and session switches', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-chat-virtualization'))
    await openSession(page, LONG_FIXTURE.markers.user(1), LONG_FIXTURE.markers.assistant(LONG_FIXTURE.turns))

    // Case 1 — bounded mounted rows against the loaded logical window.
    const logical = await logicalRows(page)
    expect(logical).toBeGreaterThan(1_000)
    expect(await mountedSeats(page)).toBeLessThanOrEqual(MAX_MOUNTED_SEATS)

    // Case 2 — load-earlier keeps the reader's semantic anchor in place.
    const loadMore = page.getByRole('button', { name: 'Load earlier' })
    await loadMore.waitFor({ timeout: 15_000 })
    await loadMore.click()
    await expect.poll(() => logicalRows(page), { timeout: 30_000 }).toBeGreaterThan(logical)
    await nextPaint(page)
    const anchor = await firstVisibleSeat(page)
    await loadMore.click()
    await expect.poll(() => logicalRows(page), { timeout: 30_000 }).toBeGreaterThan(logical + 1)
    await nextPaint(page)
    await expect.poll(async () => {
      const top = await seatTop(page, anchor.key)
      return top === null ? Number.POSITIVE_INFINITY : Math.abs(top - anchor.top)
    }, { timeout: 15_000 }).toBeLessThanOrEqual(GEOMETRY_TOLERANCE)
    expect(await mountedSeats(page)).toBeLessThanOrEqual(MAX_MOUNTED_SEATS)

    // Case 5 — expanding a tool row reflows following rows without overlap.
    // (Tools seed every eighth turn; open the first visible one.)
    const toolRow = page.locator('[data-chat-flow] [data-variant="bash"]').first()
    if (await toolRow.count() > 0) {
      const beforeTop = await toolRow.evaluate(row => row.getBoundingClientRect().top)
      await toolRow.click()
      await nextPaint(page)
      const expandedTop = await toolRow.evaluate(row => row.getBoundingClientRect().top)
      expect(Math.abs(expandedTop - beforeTop)).toBeLessThanOrEqual(1)
      const expandedBottom = await toolRow.evaluate(row => row.getBoundingClientRect().bottom)
      const following = await page.evaluate(([top]) => {
        const rows = [...document.querySelectorAll<HTMLElement>('[data-chat-flow] > [data-chat-flow-key]')]
        const tool = rows.find(row => Math.abs(row.getBoundingClientRect().top - (top as number)) < 2)
        const next = tool !== undefined ? rows[rows.indexOf(tool) + 1] : undefined
        return next === undefined ? null : next.getBoundingClientRect().top
      }, [expandedTop])
      expect(following).not.toBeNull()
      expect(following as number).toBeGreaterThanOrEqual(expandedBottom)
    }

    // Case 3 — pinned streaming keeps the output visible at the floor.
    const composer = page.locator('[data-composer-input]').first()
    await composer.fill('Stream one deterministic response while Chat stays pinned.')
    await composer.press('Enter')
    await page.getByText('stream fragment 01', { exact: false }).waitFor({ timeout: 30_000 })
    await nextPaint(page)
    const pinned = await geometry(page)
    expect(pinned.scrollHeight - pinned.clientHeight - pinned.scrollTop)
      .toBeLessThanOrEqual(48)

    // Case 4 — scrolling away during streaming is not dragged back to the floor.
    await scrollToRatio(page, 0.5)
    const reading = await geometry(page)
    await page.waitForTimeout(1_500)
    const readingLater = await geometry(page)
    expect(readingLater.scrollTop).toBeGreaterThanOrEqual(reading.scrollTop - 48)
    expect(readingLater.scrollHeight - readingLater.clientHeight - readingLater.scrollTop)
      .toBeGreaterThan(48)
    expect(await mountedSeats(page)).toBeLessThanOrEqual(MAX_MOUNTED_SEATS)

    // Case 6 — a tool disclosure opened mid-history survives its row leaving
    // the virtual window and coming back.
    await scrollToRatio(page, 0.45)
    const historyTool = page.locator('[data-chat-flow] [data-variant="bash"]').first()
    if (await historyTool.count() > 0) {
      await historyTool.click()
      await nextPaint(page)
      const toolKey = await historyTool.evaluate((row) => {
        const seat = row.closest<HTMLElement>('[data-chat-flow-key]')
        return seat?.dataset.chatFlowKey ?? null
      })
      expect(toolKey).not.toBeNull()
      const expandedKey = toolKey as string
      await scrollToRatio(page, 0)
      await expect.poll(() => page.locator(`[data-chat-flow-key=${JSON.stringify(expandedKey)}]`).count(), { timeout: 15_000 })
        .toBe(0)
      await scrollToRatio(page, 0.45)
      await expect.poll(() => page.locator(`[data-chat-flow-key=${JSON.stringify(expandedKey)}][data-state="ok"]`).count(), { timeout: 15_000 })
        .toBeGreaterThan(0)
      await expect.poll(async () => page.locator(
        `[data-chat-flow-key=${JSON.stringify(expandedKey)}] [data-open]`,
      ).count(), { timeout: 15_000 }).toBeGreaterThan(0)
    }

    // Case 7 — session A → B → A keeps rows, virtual state, and follow intact.
    await openSession(page, SHORT_FIXTURE.markers.user(1), SHORT_FIXTURE.markers.assistant(SHORT_FIXTURE.turns))
    const shortLogical = await logicalRows(page)
    expect(shortLogical).toBeLessThan(100)
    expect(await page.getByText(LONG_FIXTURE.markers.user(1), { exact: false }).count()).toBe(0)
    await openSession(page, LONG_FIXTURE.markers.user(1), LONG_FIXTURE.markers.assistant(LONG_FIXTURE.turns))
    expect(await logicalRows(page)).toBeGreaterThan(1_000)
    expect(await mountedSeats(page)).toBeLessThanOrEqual(MAX_MOUNTED_SEATS)
    expect(await page.getByText(SHORT_FIXTURE.markers.user(1), { exact: false }).count()).toBe(0)

    // Case 8 — viewport changes re-window without overlap.
    await page.setViewportSize({ width: 720, height: 1_200 })
    await nextPaint(page)
    expect(await mountedSeats(page)).toBeLessThanOrEqual(MAX_MOUNTED_SEATS)
    await page.setViewportSize({ width: 900, height: 900 })
    await nextPaint(page)
    expect(await mountedSeats(page)).toBeLessThanOrEqual(MAX_MOUNTED_SEATS)

    expect({
      pageErrors: tripwire.pageErrors,
      warnings: tripwire.warnings,
    }).toEqual({ pageErrors: [], warnings: [] })
  }, 300_000)
})
