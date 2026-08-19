// Keyless browser journey for real Agent-owned xterm sessions in the resident
// bottom panel and the tabbed right workbench.
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest'
import {
  assertFixtureInventory, compareOrRefreshGolden, launchWebScaffold, seedSession,
  watchConsole, webSnapshotMode, type WebScaffold,
} from './scaffold.ts'
import { newEnglishPage, saveFailureShot } from './support.ts'

const SNAPSHOT_DIR = fileURLToPath(new URL('./snapshots/interactive-terminal', import.meta.url))
const SEED = join(SNAPSHOT_DIR, 'seed.jsonl')
const EXPECTED = join(SNAPSHOT_DIR, 'interactive-terminal.expected.md')
const SEED_ID = 'interactive-terminal-web-e2e'
const MODE = webSnapshotMode()

async function openSeededSession(page: Page): Promise<void> {
  const conversation = page.getByText('Browse the workspace files.', { exact: true })
  const group = page.locator('[role="treeitem"]').first()
  await group.waitFor({ timeout: 15_000 })
  if (await group.getAttribute('aria-expanded') !== 'true') await group.click()
  const sessionRow = page.locator('[role="treeitem"]').nth(1)
  await Promise.any([
    conversation.waitFor({ timeout: 30_000 }),
    sessionRow.waitFor({ timeout: 30_000 }),
  ])
  if (!await conversation.isVisible()) await sessionRow.click()
  await conversation.waitFor({ timeout: 30_000 })
}

async function restoreSeededSession(page: Page): Promise<void> {
  await page.addInitScript((sessionId) => {
    localStorage.setItem('dsh.sessions.current', JSON.stringify({ sessionId }))
  }, SEED_ID)
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", '\'"\'"\'')}'`
}

async function ensureTerminalPane(panel: ReturnType<Page['locator']>): Promise<void> {
  const pane = panel.locator('[data-terminal-pane]')
  const retry = panel.getByRole('button', { name: 'Retry connection', exact: true })
  await Promise.race([
    pane.waitFor({ timeout: 30_000 }),
    retry.waitFor({ timeout: 30_000 }),
  ])
  if (await retry.isVisible()) await retry.click()
  await pane.waitFor({ timeout: 30_000 })
  await expect.poll(() => pane.getAttribute('data-terminal-phase'), { timeout: 30_000 }).toBe('ready')
}

async function sendCommand(page: Page, panel: ReturnType<Page['locator']>, command: string): Promise<void> {
  const active = panel.locator('[data-terminal-pane][data-active]')
  const input = (await active.count()) > 0
    ? active.locator('[data-terminal-viewport] textarea')
    : panel.locator('[data-terminal-viewport] textarea').first()
  await input.waitFor({ state: 'attached', timeout: 30_000 })
  await input.focus()
  await page.keyboard.type(command)
  await page.keyboard.press('Enter')
}

function renderGolden(values: {
  readonly bottomHeight: number
  readonly conversationHeight: number
  readonly bottomPanes: number
  readonly reopenedPanes: number
  readonly rightTabs: readonly string[]
  readonly rightPanes: number
  readonly rightActionsClipped: boolean
  readonly rightGuttersConsistent: boolean
  readonly settings: readonly string[]
  readonly bottomProof: string
  readonly peerProof: string
  readonly rightProof: string
  readonly compactSide: string | null
  readonly compactBottomHeight: number
}): string {
  return [
    '# Interactive terminals',
    '',
    `- bottom panel height: ${String(values.bottomHeight)}px`,
    `- conversation height with bottom panel: ${String(values.conversationHeight)}px`,
    `- bottom panes: ${String(values.bottomPanes)}`,
    `- settings: ${values.settings.join(' → ')}`,
    `- reopened bottom panes: ${String(values.reopenedPanes)}`,
    `- preserved shell variable: ${JSON.stringify(values.bottomProof)}`,
    `- second browser shares PTY state: ${JSON.stringify(values.peerProof)}`,
    `- right terminal write: ${JSON.stringify(values.rightProof)}`,
    `- right Workbench panels: ${values.rightTabs.join(' → ')}`,
    `- right active-group panes: ${String(values.rightPanes)}`,
    `- right actions clipped: ${String(values.rightActionsClipped)}`,
    `- right PTY gutters consistent: ${String(values.rightGuttersConsistent)}`,
    `- compact workbench side: ${values.compactSide ?? 'missing'}`,
    `- compact bottom panel height: ${String(values.compactBottomHeight)}px`,
  ].join('\n')
}

describe('web e2e: interactive terminals', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  let tripwire: ReturnType<typeof watchConsole>
  let consoleErrors: string[]

  beforeAll(async () => {
    scaffold = await launchWebScaffold({})
    await seedSession(scaffold, await readFile(SEED, 'utf8'), SEED_ID)
    browser = await chromium.launch()
    page = await newEnglishPage(browser, 900)
    await restoreSeededSession(page)
    tripwire = watchConsole(page)
    consoleErrors = []
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text())
    })
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(scaffold.baseUrl, { waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
    await openSeededSession(page)
  }, 120_000)

  afterAll(async () => {
    await browser?.close()
    await scaffold?.close()
  })

  it.skipIf(MODE === 'record')('keeps a bottom shell attached, opens an independent right shell, and adapts on compact screens', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-interactive-terminal'))
    const frame = page.locator('[class*="frame"]').first()
    await page.getByRole('button', { name: 'Toggle bottom panel', exact: true }).click()
    await expect.poll(() => frame.getAttribute('data-bottom-collapsed'), { timeout: 10_000 }).toBeNull()
    const bottom = page.locator('[data-terminal-panel="bottom"]')
    await expect.poll(async () => ({
      count: await bottom.count(),
      anchorCount: await page.locator('[data-slot="bottom-panel"]').count(),
      errorCount: await page.locator('[data-slot-error="bottom-panel"]').count(),
      consoleErrors,
      pageErrors: tripwire.pageErrors,
      warnings: tripwire.warnings,
    }), { timeout: 10_000 }).toEqual({ count: 1, anchorCount: 1, errorCount: 0, consoleErrors: [], pageErrors: [], warnings: [] })
    await ensureTerminalPane(bottom)
    await expect.poll(async () => Math.round((await bottom.boundingBox())?.height ?? 0), { timeout: 10_000 })
      .toBeGreaterThan(200)
    const bottomPanes = await bottom.locator('[data-terminal-pane]').count()

    await bottom.getByRole('button', { name: 'Terminal settings', exact: true }).click()
    const settingsDialog = page.getByRole('dialog', { name: 'Terminal settings', exact: true })
    await settingsDialog.waitFor({ timeout: 10_000 })
    const settings = await settingsDialog
      .locator('[data-terminal-settings] label > span, [data-terminal-settings] > div > span')
      .allTextContents()
    await settingsDialog.getByRole('button', { name: 'Theme: Harness', exact: true }).click()
    await page.getByRole('menuitem', { name: 'Tokyo Night', exact: true }).click()
    await settingsDialog.getByLabel('Ligatures').uncheck()
    await settingsDialog.getByRole('button', { name: 'Close terminal settings', exact: true }).click()

    await sendCommand(page, bottom, 'export DSH_PANEL_KEEP=alive')
    await bottom.getByRole('button', { name: 'Close bottom terminal', exact: true }).click()
    await expect.poll(() => frame.getAttribute('data-bottom-collapsed'), { timeout: 10_000 }).toBe('true')
    await page.getByRole('button', { name: 'Toggle bottom panel', exact: true }).click()
    await expect.poll(() => frame.getAttribute('data-bottom-collapsed'), { timeout: 10_000 }).toBeNull()
    const reopenedPanes = await bottom.locator('[data-terminal-pane]').count()
    const bottomProofPath = join(scaffold.workspaceCwd, 'bottom-terminal-proof.txt')
    await sendCommand(page, bottom, `printf "$DSH_PANEL_KEEP" > ${shellQuote(bottomProofPath)}`)
    await expect.poll(async () => readFile(bottomProofPath, 'utf8'), { timeout: 15_000 }).toBe('alive')

    const peer = await newEnglishPage(browser, 900)
    await restoreSeededSession(peer)
    const peerTripwire = watchConsole(peer)
    await peer.setViewportSize({ width: 1440, height: 900 })
    await peer.goto(scaffold.baseUrl, { waitUntil: 'load' })
    await peer.waitForSelector('[class*="frame"]', { timeout: 30_000 })
    await openSeededSession(peer)
    await peer.getByRole('button', { name: 'Toggle bottom panel', exact: true }).click()
    const peerBottom = peer.locator('[data-terminal-panel="bottom"]')
    await ensureTerminalPane(peerBottom)
    const peerProofPath = join(scaffold.workspaceCwd, 'peer-terminal-proof.txt')
    await sendCommand(peer, peerBottom, `printf "$DSH_PANEL_KEEP" > ${shellQuote(peerProofPath)}`)
    await expect.poll(async () => readFile(peerProofPath, 'utf8'), { timeout: 15_000 }).toBe('alive')
    expect(peerTripwire.pageErrors).toEqual([])
    expect(peerTripwire.warnings).toEqual([])
    await peer.close()

    await page.getByRole('button', { name: 'Open right panel', exact: true }).click()
    const workbench = page.locator('[data-workbench]')
    await workbench.getByRole('button', { name: 'Terminal', exact: true }).click()
    const right = page.locator('[data-terminal-panel="right"]')
    await ensureTerminalPane(right)
    await workbench.getByRole('tab', { name: 'Terminal 1', exact: true }).waitFor({ timeout: 30_000 })
    await right.getByRole('button', { name: 'New terminal', exact: true }).click()
    await workbench.getByRole('tab', { name: 'Terminal 2', exact: true }).waitFor({ timeout: 30_000 })
    await workbench.getByRole('button', { name: 'Close Terminal 2', exact: true }).click()
    await expect.poll(() => workbench.getByRole('tab', { name: 'Terminal 2', exact: true }).count()).toBe(0)
    await page.waitForTimeout(500)
    await expect.poll(() => workbench.getByRole('tab', { name: 'Terminal 2', exact: true }).count()).toBe(0)
    await right.getByRole('button', { name: 'New terminal', exact: true }).click()
    await workbench.getByRole('tab', { name: 'Terminal 2', exact: true }).waitFor({ timeout: 30_000 })
    const terminal2Body = await workbench.locator('[role="tabpanel"]').elementHandle()
    if (terminal2Body === null) throw new Error('Terminal 2 Workbench body unavailable')
    await workbench.getByRole('tab', { name: 'Terminal 1', exact: true }).click()
    await expect.poll(() => terminal2Body.evaluate(element => element.isConnected)).toBe(false)
    await expect.poll(() => right.locator('[data-phase="connecting"]').count()).toBe(0)
    await workbench.getByRole('tab', { name: 'Terminal 2', exact: true }).click()
    await ensureTerminalPane(right)
    await right.getByRole('button', { name: 'Split terminal vertically', exact: true }).click()
    await expect.poll(() => right.locator('[data-terminal-pane]').count(), { timeout: 30_000 }).toBe(2)
    await right.getByRole('button', { name: 'Split terminal horizontally', exact: true }).click()
    await expect.poll(() => right.locator('[data-terminal-pane]').count(), { timeout: 30_000 }).toBe(3)
    const rightTabs = await workbench.getByRole('tab').allTextContents()
    const rightPanes = await right.locator('[data-terminal-pane]').count()
    const sidebar = right.getByRole('complementary', { name: 'Terminal groups' })
    const rightActionsClipped = await sidebar.evaluate((element) => {
      const bounds = element.getBoundingClientRect()
      return [...element.querySelectorAll('button[aria-label]')].some((button) => {
        const rect = button.getBoundingClientRect()
        return rect.left < bounds.left || rect.right > bounds.right
      })
    })
    const groupedClose = sidebar.locator('button[class*="groupItemClose"]').last()
    await expect.poll(() => groupedClose.evaluate(element => getComputedStyle(element).opacity)).toBe('0')
    await groupedClose.locator('..').hover()
    await expect.poll(() => groupedClose.evaluate(element => getComputedStyle(element).opacity)).toBe('1')
    const rightGuttersConsistent = await right.locator('[data-terminal-pane][data-active]').evaluate((pane) => {
      const terminal = pane.querySelector('.xterm')
      if (!(terminal instanceof HTMLElement)) throw new Error('active terminal xterm unavailable')
      const outer = pane.getBoundingClientRect()
      const inner = terminal.getBoundingClientRect()
      const gutters = [inner.top - outer.top, outer.right - inner.right, outer.bottom - inner.bottom, inner.left - outer.left]
      return Math.max(...gutters) - Math.min(...gutters) <= 1
    })
    await right.getByRole('button', { name: 'Expand terminal to fullscreen', exact: true }).click()
    await expect.poll(() => right.getAttribute('data-fullscreen')).toBe('true')
    await right.getByRole('button', { name: 'Restore terminal size', exact: true }).click()
    await expect.poll(() => right.getAttribute('data-fullscreen')).toBeNull()

    const rightProofPath = join(scaffold.workspaceCwd, 'right-terminal-proof.txt')
    await sendCommand(page, right, `printf "right" > ${shellQuote(rightProofPath)}`)
    await expect.poll(async () => readFile(rightProofPath, 'utf8'), { timeout: 15_000 }).toBe('right')

    const [bottomBox, conversationBox] = await Promise.all([
      bottom.boundingBox(),
      page.locator('[data-phase]').first().boundingBox(),
    ])
    if (bottomBox === null || conversationBox === null) throw new Error('terminal panel geometry unavailable')

    await page.setViewportSize({ width: 700, height: 720 })
    const dialog = page.getByRole('dialog', { name: 'Workbench' })
    await dialog.waitFor({ timeout: 15_000 })
    await page.waitForTimeout(350)
    const compactBottomHeight = Math.round((await bottom.boundingBox())?.height ?? 0)

    await compareOrRefreshGolden(EXPECTED, renderGolden({
      bottomHeight: Math.round(bottomBox.height),
      conversationHeight: Math.round(conversationBox.height),
      bottomPanes,
      reopenedPanes,
      rightTabs,
      rightPanes,
      rightActionsClipped,
      rightGuttersConsistent,
      settings,
      bottomProof: await readFile(bottomProofPath, 'utf8'),
      peerProof: await readFile(peerProofPath, 'utf8'),
      rightProof: await readFile(rightProofPath, 'utf8'),
      compactSide: await dialog.getAttribute('data-side'),
      compactBottomHeight,
    }), MODE)
    await assertFixtureInventory(SNAPSHOT_DIR, ['interactive-terminal.expected.md', 'seed.jsonl'])
    expect(consoleErrors).toEqual([])
    expect(tripwire.pageErrors).toEqual([])
    expect(tripwire.warnings).toEqual([])
  }, 120_000)
})
