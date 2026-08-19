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
  const group = page.locator('[role="treeitem"]').first()
  await group.waitFor({ timeout: 15_000 })
  if (await group.getAttribute('aria-expanded') !== 'true') await group.click()
  await page.locator('[role="treeitem"]').nth(1).click()
  await page.getByText('Browse the workspace files.', { exact: true }).waitFor({ timeout: 30_000 })
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", '\'"\'"\'')}'`
}

async function sendCommand(page: Page, panel: ReturnType<Page['locator']>, command: string): Promise<void> {
  const input = panel.locator('[data-terminal-viewport] textarea')
  await input.waitFor({ state: 'attached', timeout: 30_000 })
  await input.focus()
  await page.keyboard.type(command)
  await page.keyboard.press('Enter')
}

function renderGolden(values: {
  readonly bottomHeight: number
  readonly conversationHeight: number
  readonly bottomTabs: readonly string[]
  readonly reopenedTabs: readonly string[]
  readonly settings: readonly string[]
  readonly bottomProof: string
  readonly rightProof: string
  readonly compactSide: string | null
  readonly compactBottomHeight: number
}): string {
  return [
    '# Interactive terminals',
    '',
    `- bottom panel height: ${String(values.bottomHeight)}px`,
    `- conversation height with bottom panel: ${String(values.conversationHeight)}px`,
    `- bottom tabs: ${values.bottomTabs.join(' → ')}`,
    `- settings: ${values.settings.join(' → ')}`,
    `- reopened bottom tabs: ${values.reopenedTabs.join(' → ')}`,
    `- preserved shell variable: ${JSON.stringify(values.bottomProof)}`,
    `- right terminal write: ${JSON.stringify(values.rightProof)}`,
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
    await bottom.getByRole('tab', { name: 'Terminal 1', exact: true }).waitFor({ timeout: 30_000 })
    await expect.poll(async () => Math.round((await bottom.boundingBox())?.height ?? 0), { timeout: 10_000 })
      .toBeGreaterThan(200)
    const bottomTabs = await bottom.getByRole('tab').allTextContents()

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
    const reopenedTabs = await bottom.getByRole('tab').allTextContents()
    const bottomProofPath = join(scaffold.workspaceCwd, 'bottom-terminal-proof.txt')
    await sendCommand(page, bottom, `printf "$DSH_PANEL_KEEP" > ${shellQuote(bottomProofPath)}`)
    await expect.poll(async () => readFile(bottomProofPath, 'utf8'), { timeout: 15_000 }).toBe('alive')

    await page.getByRole('button', { name: 'Open right panel', exact: true }).click()
    const workbench = page.locator('[data-workbench]')
    await workbench.getByRole('button', { name: 'Terminal', exact: true }).click()
    const right = page.locator('[data-terminal-panel="right"]')
    await right.getByRole('tab', { name: 'Terminal 1', exact: true }).waitFor({ timeout: 30_000 })
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
      bottomTabs,
      reopenedTabs,
      settings,
      bottomProof: await readFile(bottomProofPath, 'utf8'),
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
