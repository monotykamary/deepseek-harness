// Keyless browser journey for the T3-adapted Files workbench: the Session
// header toggles an empty right panel, its launcher opens a lazy real-Host tree,
// and the syntax editor autosaves through the version-guarded write Remote.
import { mkdir, readFile, writeFile } from 'node:fs/promises'
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

const SNAPSHOT_DIR = fileURLToPath(new URL('./snapshots/files-workbench', import.meta.url))
const SEED = join(SNAPSHOT_DIR, 'seed.jsonl')
const EXPECTED = join(SNAPSHOT_DIR, 'files-workbench.expected.md')
const SEED_ID = 'files-workbench-web-e2e'
const MODE = webSnapshotMode()

async function rowLabels(rows: ReturnType<Page['locator']>): Promise<string[]> {
  return (await rows.allInnerTexts()).map(text => text.trim().replace(/\s+/gu, ' '))
}

async function openSeededSession(page: Page): Promise<void> {
  const group = page.locator('[role="treeitem"]').first()
  await group.waitFor({ timeout: 15_000 })
  if (await group.getAttribute('aria-expanded') !== 'true') await group.click()
  const conversation = page.getByText('Browse the workspace files.', { exact: true })
  const sessionRow = page.locator('[role="treeitem"]').nth(1)
  await Promise.any([
    conversation.waitFor({ timeout: 30_000 }),
    sessionRow.waitFor({ timeout: 30_000 }),
  ])
  if (!await conversation.isVisible()) await sessionRow.click()
  await conversation.waitFor({ timeout: 30_000 })
}

function renderGolden(values: {
  compactOverflow: number
  compactSide: string | null
  compactWidth: number
  desktopOverflow: number
  desktopWidth: number
  editedSource: string
  emptyCards: string[]
  expandedRows: string[]
  filteredRows: string[]
  fullscreenEditor: boolean
  iconBeforeHover: boolean
  closeAfterHover: boolean
  preview: string
  rootRows: string[]
  tabs: string[]
  wrapIconSize: string
}): string {
  return [
    '# Files workbench',
    '',
    `- empty cards: ${values.emptyCards.join(' → ')}`,
    `- root rows: ${values.rootRows.join(' → ')}`,
    `- expanded rows: ${values.expandedRows.join(' → ')}`,
    `- preview: ${JSON.stringify(values.preview)}`,
    `- edited source: ${JSON.stringify(values.editedSource)}`,
    `- fullscreen editor: ${String(values.fullscreenEditor)}`,
    `- wrap icon size: ${values.wrapIconSize}`,
    `- tab icon before hover: ${String(values.iconBeforeHover)}`,
    `- tab close after hover: ${String(values.closeAfterHover)}`,
    `- filtered rows: ${values.filteredRows.join(' → ')}`,
    `- tabs: ${values.tabs.join(' → ')}`,
    `- desktop width: ${String(values.desktopWidth)}px`,
    `- desktop horizontal overflow: ${String(values.desktopOverflow)}px`,
    `- compact side: ${values.compactSide ?? 'missing'}`,
    `- compact width: ${String(values.compactWidth)}px`,
    `- compact horizontal overflow: ${String(values.compactOverflow)}px`,
  ].join('\n')
}

describe('web e2e: Files workbench', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  let tripwire: ReturnType<typeof watchConsole>

  beforeAll(async () => {
    scaffold = await launchWebScaffold({})
    await mkdir(join(scaffold.workspaceCwd, 'src'), { recursive: true })
    await writeFile(join(scaffold.workspaceCwd, 'README.md'), '# Files fixture\n')
    await writeFile(
      join(scaffold.workspaceCwd, 'src/index.ts'),
      'export const answer = 42\n',
    )
    await seedSession(scaffold, await readFile(SEED, 'utf8'), SEED_ID)
    browser = await chromium.launch()
    page = await newEnglishPage(browser, 900)
    tripwire = watchConsole(page)
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(scaffold.baseUrl, { waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
    await openSeededSession(page)
  }, 120_000)

  afterAll(async () => {
    await browser?.close()
    await scaffold?.close()
  })

  it.skipIf(MODE === 'record')('opens, edits, filters, and adapts through the assembled app', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-files-workbench'))
    const frame = page.locator('[class*="frame"]').first()
    await page.getByRole('button', { name: 'Open right panel', exact: true }).click()
    const collapseToggle = page.getByRole('button', { name: 'Collapse right panel', exact: true })
    await collapseToggle.waitFor()
    expect(await collapseToggle.getAttribute('aria-expanded')).toBe('true')
    await collapseToggle.click()
    await page.locator('[data-details-collapsed]').waitFor({ timeout: 5_000 })
    expect(await frame.getAttribute('data-details-collapsed')).not.toBeNull()
    const openToggle = page.getByRole('button', { name: 'Open right panel', exact: true })
    expect(await openToggle.getAttribute('aria-expanded')).toBe('false')
    await openToggle.click()
    await page.getByRole('button', { name: 'Collapse right panel', exact: true }).waitFor()
    const workbench = page.locator('[data-workbench]')
    await workbench.waitFor({ timeout: 10_000 })
    await workbench.getByRole('heading', { name: 'Open a surface', exact: true }).waitFor()
    const launcherCards = workbench.locator('[data-workbench-launcher-card]')
    const emptyCards = await launcherCards.evaluateAll(cards => cards.flatMap((card) => {
      const id = card.getAttribute('data-workbench-launcher-card')
      return id === null ? [] : [id]
    }))
    await workbench.getByRole('button', { name: 'Files', exact: true }).click()

    const panel = workbench.locator('[data-workbench-files]')
    const treeRows = panel.getByRole('treeitem')
    await treeRows.filter({ hasText: /^src$/u }).waitFor({ timeout: 10_000 })
    const rootRows = await rowLabels(treeRows)

    const filesTab = workbench.getByRole('tab', { name: 'Files', exact: true }).locator('..')
    const icon = filesTab.locator('[data-workbench-tab-icon]')
    const closeGlyph = filesTab.locator('[data-workbench-tab-close-glyph]')
    const iconBeforeHover = await icon.evaluate(element => getComputedStyle(element).display !== 'none')
    await filesTab.hover()
    const closeAfterHover = await closeGlyph.evaluate(element => getComputedStyle(element).display !== 'none')

    await treeRows.filter({ hasText: /^src$/u }).click()
    await treeRows.filter({ hasText: /^index\.ts$/u }).waitFor({ timeout: 10_000 })
    const expandedRows = await rowLabels(treeRows)

    await treeRows.filter({ hasText: /^index\.ts$/u }).click()
    const editor = panel.getByRole('textbox', { name: 'Edit src/index.ts', exact: true })
    await editor.waitFor({ timeout: 10_000 })
    const preview = await editor.inputValue()
    const wrapIconBox = await panel.getByRole('button', { name: 'Wrap text', exact: true }).locator('svg').boundingBox()
    const wrapIconSize = wrapIconBox === null
      ? 'missing'
      : `${String(Math.round(wrapIconBox.width))}×${String(Math.round(wrapIconBox.height))}`
    await panel.getByRole('button', { name: 'Edit file in fullscreen', exact: true }).click()
    const fullscreenBox = await panel.locator('[data-fullscreen]').boundingBox()
    const fullscreenEditor = fullscreenBox !== null
      && Math.round(fullscreenBox.x) === 0
      && Math.round(fullscreenBox.y) === 0
      && Math.round(fullscreenBox.width) === 1440
      && Math.round(fullscreenBox.height) === 900
      && await editor.isVisible()
    await panel.getByRole('button', { name: 'Restore editor size', exact: true }).click()
    await expect.poll(() => panel.locator('[data-fullscreen]').count()).toBe(0)
    const editedSource = 'export const answer = 43\n'
    await editor.fill(editedSource)
    await panel.getByText('Saved', { exact: true }).waitFor({ timeout: 10_000 })
    await expect.poll(
      async () => readFile(join(scaffold.workspaceCwd, 'src/index.ts'), 'utf8'),
      { timeout: 10_000 },
    ).toBe(editedSource)

    await panel.getByRole('button', { name: 'Back to files', exact: true }).click()
    await panel.getByPlaceholder('Filter loaded files').fill('README')
    await treeRows.filter({ hasText: 'README.md' }).waitFor({ timeout: 10_000 })
    const filteredRows = await rowLabels(treeRows)
    const tabs = await workbench.getByRole('tab').allTextContents()
    const desktop = await workbench.evaluate(element => ({
      overflow: element.scrollWidth - element.clientWidth,
      width: Math.round(element.getBoundingClientRect().width),
    }))

    await page.setViewportSize({ width: 700, height: 900 })
    const dialog = page.getByRole('dialog', { name: 'Workbench' })
    await dialog.waitFor({ timeout: 10_000 })
    await page.waitForTimeout(350)
    const compact = await workbench.evaluate(element => ({
      overflow: element.scrollWidth - element.clientWidth,
      width: Math.round(element.getBoundingClientRect().width),
    }))

    await compareOrRefreshGolden(EXPECTED, renderGolden({
      closeAfterHover,
      compactOverflow: compact.overflow,
      compactSide: await dialog.getAttribute('data-side'),
      compactWidth: compact.width,
      desktopOverflow: desktop.overflow,
      desktopWidth: desktop.width,
      editedSource,
      emptyCards,
      expandedRows,
      filteredRows,
      fullscreenEditor,
      iconBeforeHover,
      preview,
      rootRows,
      tabs,
      wrapIconSize,
    }), MODE)
    await assertFixtureInventory(SNAPSHOT_DIR, ['files-workbench.expected.md', 'seed.jsonl'])
    expect(tripwire.pageErrors).toEqual([])
    expect(tripwire.warnings).toEqual([])
  }, 90_000)
})
