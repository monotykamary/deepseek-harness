import { createServer, type Server } from 'node:http'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest'
import {
  captureStableAria, compareOrRefreshGolden, launchWebScaffold, watchConsole,
  webSnapshotMode, type WebScaffold,
} from './scaffold.ts'
import { saveFailureShot } from './support.ts'

const EXPECTED = fileURLToPath(new URL('./snapshots/distribution-updates/source.expected.md', import.meta.url))
const APP_MANIFEST = fileURLToPath(new URL('../../cli/package.json', import.meta.url))
const MODE = webSnapshotMode()

describe.skipIf(MODE === 'record')('web e2e: distribution updates', () => {
  let registry: Server
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  let tripwire: ReturnType<typeof watchConsole>

  beforeAll(async () => {
    const manifest = JSON.parse(await readFile(APP_MANIFEST, 'utf8')) as { dependencies: Record<string, string> }
    registry = createServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ version: '999.0.0', dependencies: manifest.dependencies }))
    })
    await new Promise<void>((resolve, reject) => {
      registry.once('error', reject)
      registry.listen(0, '127.0.0.1', resolve)
    })
    const address = registry.address()
    if (address === null || typeof address === 'string') throw new Error('update registry has no TCP address')
    scaffold = await launchWebScaffold({ distributionUpdateRegistryUrl: `http://127.0.0.1:${String(address.port)}` })
    browser = await chromium.launch()
    page = await browser.newPage({ viewport: { width: 1440, height: 960 }, locale: 'en-US' })
    tripwire = watchConsole(page)
    await page.goto(scaffold.baseUrl, { waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
  }, 120_000)

  afterAll(async () => {
    await browser?.close()
    await scaffold?.close()
    await new Promise<void>((resolve, reject) => registry.close((error) => {
      if (error === undefined) resolve()
      else reject(error)
    }))
  })

  it('offers an automatic source upgrade without downgrade or git-pull guidance', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-distribution-updates'))
    const welcome = page.getByRole('dialog', { name: 'A complete coding-agent workbench' })
    if (await welcome.count() > 0) {
      await welcome.getByRole('button', { name: 'Continue' }).click()
      await welcome.waitFor({ state: 'detached', timeout: 15_000 })
    }
    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    const settings = page.getByRole('dialog', { name: 'Settings' })
    await settings.getByRole('button', { name: 'Updates' }).click()
    await settings.getByText('999.0.0', { exact: false }).waitFor({ timeout: 15_000 })
    expect(await settings.getByRole('button', { name: 'Update DSH' }).count()).toBe(1)
    expect(await settings.getByText('git pull', { exact: false }).count()).toBe(0)
    const snapshot = await captureStableAria(page, '[role="dialog"]', scaffold.workspaceCwd)
    await compareOrRefreshGolden(EXPECTED, snapshot, MODE)
    expect(tripwire.pageErrors).toEqual([])
  })
})
