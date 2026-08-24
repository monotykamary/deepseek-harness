import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest'
import {
  captureStableAria, compareOrRefreshGolden, launchWebScaffold, watchConsole,
  webSnapshotMode, type WebScaffold,
} from './scaffold.ts'
import { saveFailureShot } from './support.ts'

const EXPECTED = fileURLToPath(new URL('./snapshots/multiprovider/accounts.expected.md', import.meta.url))
const MULTIPROVIDER_PATCH = createRequire(import.meta.url).resolve('dsh-multiprovider/cordis.patch.yml')
const MODE = webSnapshotMode()

describe.skipIf(MODE === 'record')('web e2e: multiprovider settings', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  let tripwire: ReturnType<typeof watchConsole>

  beforeAll(async () => {
    scaffold = await launchWebScaffold({ extraOverlayPath: MULTIPROVIDER_PATCH })
    browser = await chromium.launch()
    page = await browser.newPage({ viewport: { width: 1440, height: 960 }, locale: 'en-US' })
    tripwire = watchConsole(page)
    await page.goto(scaffold.baseUrl, { waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
  }, 120_000)

  afterAll(async () => {
    await browser?.close()
    await scaffold?.close()
  })

  it('shows the installed secret-free account scheduler in Settings', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-multiprovider-settings'))
    const welcome = page.getByRole('dialog', { name: 'A complete coding-agent workbench' })
    if (await welcome.count() > 0) {
      await welcome.getByRole('button', { name: 'Continue' }).click()
      await welcome.waitFor({ state: 'detached', timeout: 15_000 })
    }
    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    const settings = page.getByRole('dialog', { name: 'Settings' })
    await settings.getByRole('button', { name: 'Accounts' }).click()
    await settings.getByRole('heading', { name: 'Provider accounts' }).waitFor({ timeout: 15_000 })
    await settings.getByText('No provider has registered an account pool yet.').waitFor({ timeout: 15_000 })
    const snapshot = await captureStableAria(page, '[role="dialog"]', scaffold.workspaceCwd)
    await compareOrRefreshGolden(EXPECTED, snapshot, MODE)
    expect(tripwire.pageErrors).toEqual([])
  })
})
