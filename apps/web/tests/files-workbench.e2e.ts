// Keyless browser journey for the T3-adapted Files workbench: the session
// header opens a lazy tree backed by the real Host Remote, previews a file,
// filters loaded nodes, and keeps the same view in the compact right Sheet.
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
  await page.locator('[role="treeitem"]').nth(1).click()
  await page.getByText('Browse the workspace files.', { exact: true })
    .waitFor({ timeout: 30_000 })
}

function renderGolden(values: {
  compactOverflow: number
  compactSide: string | null
  compactWidth: number
  desktopOverflow: number
  desktopWidth: number
  expandedRows: string[]
  filteredRows: string[]
  preview: string
  rootRows: string[]
  tabs: string[]
}): string {
  return [
    '# Files workbench',
    '',
    `- root rows: ${values.rootRows.join(' → ')}`,
    `- expanded rows: ${values.expandedRows.join(' → ')}`,
    `- preview: ${JSON.stringify(values.preview)}`,
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

  it.skipIf(MODE === 'record')('browses, previews, filters, and adapts through the assembled app', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-files-workbench'))
    await page.getByRole('button', { name: 'Open files', exact: true }).click()
    const workbench = page.locator('[data-workbench]')
    const panel = workbench.locator('[data-workbench-files]')
    await workbench.waitFor({ timeout: 10_000 })
    const treeRows = panel.getByRole('treeitem')
    await treeRows.filter({ hasText: /^src$/u }).waitFor({ timeout: 10_000 })
    const rootRows = await rowLabels(treeRows)

    await treeRows.filter({ hasText: /^src$/u }).click()
    await treeRows.filter({ hasText: /^index\.ts$/u }).waitFor({ timeout: 10_000 })
    const expandedRows = await rowLabels(treeRows)

    await treeRows.filter({ hasText: /^index\.ts$/u }).click()
    await panel.getByText('src/index.ts', { exact: true }).waitFor({ timeout: 10_000 })
    await panel.locator('pre').getByText('export const answer = 42', { exact: false })
      .waitFor({ timeout: 10_000 })
    const preview = await panel.locator('pre').innerText()

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
      compactOverflow: compact.overflow,
      compactSide: await dialog.getAttribute('data-side'),
      compactWidth: compact.width,
      desktopOverflow: desktop.overflow,
      desktopWidth: desktop.width,
      expandedRows,
      filteredRows,
      preview,
      rootRows,
      tabs,
    }), MODE)
    await assertFixtureInventory(SNAPSHOT_DIR, ['files-workbench.expected.md', 'seed.jsonl'])
    expect(tripwire.pageErrors).toEqual([])
    expect(tripwire.warnings).toEqual([])
  }, 90_000)
})
