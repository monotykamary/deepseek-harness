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

async function revealTerminalActions(panel: ReturnType<Page['locator']>): Promise<void> {
  const toggle = panel.getByRole('button', { name: 'Show terminal actions', exact: true })
  if (!await toggle.isVisible()) return
  await toggle.hover()
  await panel.getByRole('button', { name: 'Hide terminal actions', exact: true }).waitFor()
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
  readonly floatingActionsCollapsed: boolean
  readonly floatingActionsAnimated: boolean
  readonly floatingActionButtonsStable: boolean
  readonly bottomGroupedFullscreenVisible: boolean
  readonly bottomActionsClipped: boolean
  readonly reopenedPanes: number
  readonly rightTabs: readonly string[]
  readonly rightPanes: number
  readonly rightActionsClipped: boolean
  readonly groupedFullscreenVisible: boolean
  readonly groupTreeIndented: boolean
  readonly groupHeadingPill: boolean
  readonly rightGuttersConsistent: boolean
  readonly implicitScrollbarVisible: boolean
  readonly implicitScrollbarNoGap: boolean
  readonly settings: readonly string[]
  readonly bottomProof: string
  readonly peerProof: string
  readonly rightProof: string
  readonly rightEmptyStateFlash: boolean
  readonly rightPanelsRetained: boolean
  readonly compactSide: string | null
  readonly compactBottomHeight: number
}): string {
  return [
    '# Interactive terminals',
    '',
    `- bottom panel height: ${String(values.bottomHeight)}px`,
    `- conversation height with bottom panel: ${String(values.conversationHeight)}px`,
    `- bottom panes: ${String(values.bottomPanes)}`,
    `- floating actions default: ${values.floatingActionsCollapsed ? 'collapsed' : 'expanded'}`,
    `- floating actions animate on hover: ${String(values.floatingActionsAnimated)}`,
    `- floating action buttons stable on icon hover: ${String(values.floatingActionButtonsStable)}`,
    `- bottom grouped fullscreen action: ${values.bottomGroupedFullscreenVisible ? 'visible' : 'missing'}`,
    `- bottom grouped actions clipped: ${String(values.bottomActionsClipped)}`,
    `- settings: ${values.settings.join(' → ')}`,
    `- reopened bottom panes: ${String(values.reopenedPanes)}`,
    `- preserved shell variable: ${JSON.stringify(values.bottomProof)}`,
    `- second browser shares PTY state: ${JSON.stringify(values.peerProof)}`,
    `- right terminal write: ${JSON.stringify(values.rightProof)}`,
    `- right empty-state flash: ${String(values.rightEmptyStateFlash)}`,
    `- right panels retained across switches: ${String(values.rightPanelsRetained)}`,
    `- right Workbench panels: ${values.rightTabs.join(' → ')}`,
    `- right active-group panes: ${String(values.rightPanes)}`,
    `- right actions clipped: ${String(values.rightActionsClipped)}`,
    `- grouped fullscreen action: ${values.groupedFullscreenVisible ? 'visible' : 'missing'}`,
    `- group tree indented: ${String(values.groupTreeIndented)}`,
    `- group heading pill: ${String(values.groupHeadingPill)}`,
    `- right PTY gutters consistent: ${String(values.rightGuttersConsistent)}`,
    `- implicit scrollbar visible above bottom: ${String(values.implicitScrollbarVisible)}`,
    `- implicit scrollbar reserves no width: ${String(values.implicitScrollbarNoGap)}`,
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
    const floatingActionsCollapsed = await bottom.getByRole('button', { name: 'Show terminal actions', exact: true }).isVisible()
      && await bottom.getByRole('button', { name: 'Split terminal horizontally', exact: true }).count() === 0
    const floatingOverlay = bottom.locator('[data-terminal-floating-actions]')
    const collapsedActionWidth = (await floatingOverlay.boundingBox())?.width ?? 0
    await bottom.getByRole('button', { name: 'Show terminal actions', exact: true }).hover()
    await bottom.getByRole('button', { name: 'Split terminal horizontally', exact: true }).waitFor()
    await expect.poll(async () => (await floatingOverlay.boundingBox())?.width ?? 0).toBeGreaterThan(collapsedActionWidth + 100)
    const floatingActionsAnimated = await bottom.locator('[data-terminal-action-reveal]').evaluate(element => (
      getComputedStyle(element).transitionProperty.includes('max-width')
    ))
    await page.mouse.move(0, 0)

    await revealTerminalActions(bottom)
    await page.waitForTimeout(250)
    const floatingButtons = floatingOverlay.locator('button')
    const buttonGeometryBeforeHover = await floatingButtons.evaluateAll(buttons => buttons.map((button) => {
      const rect = button.getBoundingClientRect()
      return [rect.x, rect.width]
    }))
    await bottom.getByRole('button', { name: 'Split terminal horizontally', exact: true }).hover()
    await page.getByRole('tooltip', { name: 'Split terminal horizontally', exact: true }).waitFor()
    const buttonGeometryAfterHover = await floatingButtons.evaluateAll(buttons => buttons.map((button) => {
      const rect = button.getBoundingClientRect()
      return [rect.x, rect.width]
    }))
    expect(buttonGeometryAfterHover).toEqual(buttonGeometryBeforeHover)
    const floatingActionButtonsStable = true
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

    await revealTerminalActions(bottom)
    await bottom.getByRole('button', { name: 'Split terminal horizontally', exact: true }).click()
    await expect.poll(() => bottom.locator('[data-terminal-pane]').count(), { timeout: 30_000 }).toBe(2)
    const bottomSidebar = bottom.getByRole('complementary', { name: 'Terminal groups' })
    const bottomGroupedFullscreenVisible = await bottomSidebar.getByRole('button', { name: 'Expand terminal to fullscreen', exact: true }).isVisible()
    const bottomActionsClipped = await bottomSidebar.evaluate((element) => {
      const bounds = element.getBoundingClientRect()
      return [...element.querySelectorAll('[data-terminal-sidebar-actions] button')].some((button) => {
        const rect = button.getBoundingClientRect()
        return rect.left < bounds.left || rect.right > bounds.right
      })
    })
    await bottomSidebar.getByRole('button', { name: 'Kill terminal', exact: true }).click()
    await expect.poll(() => bottom.locator('[data-terminal-pane]').count(), { timeout: 30_000 }).toBe(1)

    await sendCommand(page, bottom, 'export DSH_PANEL_KEEP=alive')
    await revealTerminalActions(bottom)
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

    await page.evaluate(() => {
      document.body.dataset.terminalEmptyStateFlash = 'false'
      const observer = new MutationObserver(() => {
        if (document.body.innerText.includes('No terminal is available.')) {
          document.body.dataset.terminalEmptyStateFlash = 'true'
        }
      })
      observer.observe(document.body, { childList: true, subtree: true, characterData: true })
    })
    await page.getByRole('button', { name: 'Open right panel', exact: true }).click()
    const workbench = page.locator('[data-workbench]')
    await workbench.getByRole('button', { name: 'Terminal', exact: true }).click()
    const right = workbench.locator('[role="tabpanel"][data-active] [data-terminal-panel="right"]')
    await ensureTerminalPane(right)
    await workbench.getByRole('tab', { name: 'Terminal 1', exact: true }).waitFor({ timeout: 30_000 })
    await revealTerminalActions(right)
    await right.getByRole('button', { name: 'New terminal', exact: true }).click()
    await workbench.getByRole('tab', { name: 'Terminal 2', exact: true }).waitFor({ timeout: 30_000 })
    await workbench.getByRole('button', { name: 'Close Terminal 2', exact: true }).click()
    await expect.poll(() => workbench.getByRole('tab', { name: 'Terminal 2', exact: true }).count()).toBe(0)
    await page.waitForTimeout(500)
    await expect.poll(() => workbench.getByRole('tab', { name: 'Terminal 2', exact: true }).count()).toBe(0)
    await revealTerminalActions(right)
    await right.getByRole('button', { name: 'New terminal', exact: true }).click()
    await workbench.getByRole('tab', { name: 'Terminal 2', exact: true }).waitFor({ timeout: 30_000 })
    const terminal2Body = await workbench.locator('[role="tabpanel"][data-active]').elementHandle()
    if (terminal2Body === null) throw new Error('Terminal 2 Workbench body unavailable')
    await ensureTerminalPane(right)
    await workbench.getByRole('tab', { name: 'Terminal 1', exact: true }).click()
    const terminal1ReadyOnSwitch = await right.locator('[data-terminal-pane][data-terminal-phase="ready"]').count() > 0
    const terminal2RetainedWhileHidden = await terminal2Body.evaluate(element => (
      element.isConnected && element.getAttribute('aria-hidden') === 'true' && element.hasAttribute('inert')
    ))
    await workbench.getByRole('tab', { name: 'Terminal 2', exact: true }).click()
    const terminal2ReadyOnSwitch = await right.locator('[data-terminal-pane][data-terminal-phase="ready"]').count() > 0
    const rightPanelsRetained = terminal1ReadyOnSwitch && terminal2RetainedWhileHidden && terminal2ReadyOnSwitch
    await revealTerminalActions(right)
    await right.getByRole('button', { name: 'Split terminal vertically', exact: true }).click()
    await expect.poll(() => right.locator('[data-terminal-pane]').count(), { timeout: 30_000 }).toBe(2)
    await right.getByRole('button', { name: 'Split terminal horizontally', exact: true }).click()
    await expect.poll(() => right.locator('[data-terminal-pane]').count(), { timeout: 30_000 }).toBe(3)
    const rightTabs = await workbench.getByRole('tab').allTextContents()
    const rightPanes = await right.locator('[data-terminal-pane]').count()
    const sidebar = right.getByRole('complementary', { name: 'Terminal groups' })
    const groupedFullscreenVisible = await sidebar.getByRole('button', { name: 'Expand terminal to fullscreen', exact: true }).isVisible()
    const groupTreeStyle = await sidebar.evaluate((element) => {
      const label = element.querySelector('[data-terminal-group-label]')
      const row = element.querySelector('[data-terminal-group-row]')
      if (!(label instanceof HTMLElement) || !(row instanceof HTMLElement)) {
        return { indented: false, pill: false }
      }
      const background = getComputedStyle(label).backgroundColor
      return {
        indented: row.getBoundingClientRect().left > label.getBoundingClientRect().left,
        pill: background !== 'rgba(0, 0, 0, 0)' && background !== 'transparent',
      }
    })
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
    const rightEmptyStateFlash = await page.evaluate(() => document.body.dataset.terminalEmptyStateFlash === 'true')
    const rightGuttersConsistent = await right.locator('[data-terminal-pane][data-active]').evaluate((pane) => {
      const terminal = pane.querySelector('.xterm')
      if (!(terminal instanceof HTMLElement)) throw new Error('active terminal xterm unavailable')
      const outer = pane.getBoundingClientRect()
      const inner = terminal.getBoundingClientRect()
      const gutters = [inner.top - outer.top, outer.right - inner.right, outer.bottom - inner.bottom, inner.left - outer.left]
      return Math.max(...gutters) - Math.min(...gutters) <= 1
    })
    await sendCommand(page, right, 'i=0; while [ "$i" -lt 80 ]; do printf "scroll-%s\n" "$i"; i=$((i+1)); done')
    const activeRightPane = right.locator('[data-terminal-pane][data-active]')
    const implicitTrack = activeRightPane.locator('[data-terminal-scrollbar-track]')
    await activeRightPane.locator('[data-terminal-viewport]').hover()
    await page.mouse.wheel(0, -1600)
    await expect.poll(() => implicitTrack.getAttribute('data-visible')).toBe('')
    const implicitScrollbarVisible = await implicitTrack.isVisible()
    const implicitScrollbarNoGap = await activeRightPane.evaluate((pane) => {
      const terminal = pane.querySelector('.xterm')
      const viewport = pane.querySelector('.xterm-viewport')
      const track = pane.querySelector('[data-terminal-scrollbar-track]')
      const nativeScrollbar = pane.querySelector('.xterm-scrollable-element > .scrollbar, .xterm-scrollable-element > .xterm-scrollbar')
      if (!(terminal instanceof HTMLElement) || !(viewport instanceof HTMLElement) || !(track instanceof HTMLElement)) return false
      const terminalRect = terminal.getBoundingClientRect()
      const viewportRect = viewport.getBoundingClientRect()
      return Math.abs(terminalRect.width - viewportRect.width) <= 1
        && (nativeScrollbar === null || getComputedStyle(nativeScrollbar).display === 'none')
    })
    await page.mouse.wheel(0, 100_000)
    await expect.poll(() => implicitTrack.getAttribute('data-visible')).toBeNull()

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
      floatingActionsCollapsed,
      floatingActionsAnimated,
      floatingActionButtonsStable,
      bottomGroupedFullscreenVisible,
      bottomActionsClipped,
      reopenedPanes,
      rightTabs,
      rightPanes,
      rightActionsClipped,
      groupedFullscreenVisible,
      groupTreeIndented: groupTreeStyle.indented,
      groupHeadingPill: groupTreeStyle.pill,
      rightGuttersConsistent,
      implicitScrollbarVisible,
      implicitScrollbarNoGap,
      settings,
      bottomProof: await readFile(bottomProofPath, 'utf8'),
      peerProof: await readFile(peerProofPath, 'utf8'),
      rightProof: await readFile(rightProofPath, 'utf8'),
      rightEmptyStateFlash,
      rightPanelsRetained,
      compactSide: await dialog.getAttribute('data-side'),
      compactBottomHeight,
    }), MODE)
    await assertFixtureInventory(SNAPSHOT_DIR, ['interactive-terminal.expected.md', 'seed.jsonl'])
    expect(consoleErrors).toEqual([])
    expect(tripwire.pageErrors).toEqual([])
    expect(tripwire.warnings).toEqual([])
  }, 120_000)
})
