// Keyless browser journey for the T3-adapted workbench: a changed-files card
// opens Changes inline, Tool Inspect adds a peer tab, and layout
// concession rehosts the same workbench in a right Sheet.
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

const SNAPSHOT_DIR = fileURLToPath(new URL('./snapshots/workbench', import.meta.url))
const SEED = join(SNAPSHOT_DIR, 'seed.jsonl')
const EXPECTED = join(SNAPSHOT_DIR, 'workbench.expected.md')
const SEED_ID = 'workbench-web-e2e'
const MODE = webSnapshotMode()

async function openSeededSession(page: Page): Promise<void> {
  const group = page.locator('[role="treeitem"]').first()
  await group.waitFor({ timeout: 15_000 })
  if (await group.getAttribute('aria-expanded') !== 'true') await group.click()
  const session = page.locator('[role="treeitem"]').nth(1)
  await session.click()
  await page.getByText('Created src/workbench.ts with the requested exported constant.', { exact: false })
    .waitFor({ timeout: 30_000 })
}

async function conversationWidth(page: Page): Promise<number> {
  return await page.evaluate(() => {
    const conversation = document.querySelector<HTMLElement>('[data-conversation-scroll]')
      ?.closest<HTMLElement>('[data-phase]')
    if (!conversation) throw new Error('conversation host missing')
    return Math.round(conversation.getBoundingClientRect().width)
  })
}

function renderGolden(values: {
  inlineConversation: number
  inlineWorkbench: number
  tabs: string[]
  inspectTitle: string
  inspectorStickyGap: number
  changedCard: string
  changedTree: string
  changesSummary: string
  changesAccordion: string
  compactConversation: number
  compactSide: string | null
  closed: boolean
}): string {
  return [
    '# UI workbench',
    '',
    `- inline conversation width: ${String(values.inlineConversation)}px`,
    `- inline workbench width: ${String(values.inlineWorkbench)}px`,
    `- tabs after Tool Inspect: ${values.tabs.join(' → ')}`,
    `- inspector title: ${values.inspectTitle}`,
    `- inspector sticky gap after scroll: ${String(values.inspectorStickyGap)}px`,
    `- changed-files card: ${values.changedCard}`,
    `- changed-files tree: ${values.changedTree}`,
    `- Changes summary: ${values.changesSummary}`,
    `- Changes accordion: ${values.changesAccordion}`,
    `- compact conversation width: ${String(values.compactConversation)}px`,
    `- compact workbench side: ${values.compactSide ?? 'missing'}`,
    `- compact close returns to Chat: ${String(values.closed)}`,
  ].join('\n')
}

describe('web e2e: UI workbench', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  let tripwire: ReturnType<typeof watchConsole>

  beforeAll(async () => {
    scaffold = await launchWebScaffold({})
    await seedSession(scaffold, await readFile(SEED, 'utf8'), SEED_ID)
    browser = await chromium.launch()
    page = await newEnglishPage(browser, 900)
    tripwire = watchConsole(page)
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(scaffold.baseUrl, { waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
    const continueButton = page.getByRole('button', { name: 'Continue', exact: true })
    if (await continueButton.isVisible()) await continueButton.click()
    await openSeededSession(page)
  }, 120_000)

  afterAll(async () => {
    await browser?.close()
    await scaffold?.close()
  })

  it.skipIf(MODE === 'record')('opens Changes and Inspect inline, then rehosts in a compact right Sheet', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-workbench'))
    const changedFilesCard = page.locator('[data-changed-files-card]')
    await changedFilesCard.getByText('Changed files (1)', { exact: true }).waitFor()
    const changedFolder = changedFilesCard.getByRole('button', { name: /^src/u })
    expect(await changedFolder.getAttribute('aria-expanded')).toBe('true')
    await changedFilesCard.getByRole('button', { name: 'View diff for src/workbench.ts', exact: true }).waitFor()
    const changedCard = 'Changed files (1) · +1 −0'
    const changedTree = 'src → workbench.ts'
    await changedFilesCard.getByRole('button', { name: 'View diff', exact: true }).click()
    const workbench = page.locator('[data-workbench]')
    await workbench.waitFor({ timeout: 10_000 })
    await page.waitForTimeout(350)
    const inlineConversation = await conversationWidth(page)
    const inlineWorkbench = await workbench.evaluate(element => Math.round(element.getBoundingClientRect().width))
    const changesSummary = await workbench.getByText(/1 changed file · \+1 −0/u).innerText()
    await workbench.getByText('export const workbench = true', { exact: true }).waitFor({ timeout: 10_000 })
    const changeDisclosure = workbench.getByRole('button', { name: /^src\/workbench\.ts/u })
    expect(await changeDisclosure.getAttribute('aria-expanded')).toBe('true')
    await changeDisclosure.click()
    expect(await changeDisclosure.getAttribute('aria-expanded')).toBe('false')
    await changeDisclosure.click()
    expect(await changeDisclosure.getAttribute('aria-expanded')).toBe('true')
    const changesAccordion = 'expanded → collapsed → expanded'

    const call = page.locator('[data-chat-call-id="call-workbench-write"]')
    const disclosure = call.locator('[data-expandable]')
    await disclosure.evaluate((element) => { (element as HTMLElement).click() })
    await expect.poll(async () => await disclosure.getAttribute('aria-expanded')).toBe('true')
    await call.getByRole('button', { name: 'Inspect', exact: true }).click()
    await workbench.getByRole('tab', { name: 'Inspect', exact: true }).waitFor({ timeout: 10_000 })
    const tabs = await workbench.getByRole('tab').allTextContents()
    const inspectTitle = await workbench.locator('[class*="title"]').last().innerText()
    expect(await workbench.getByRole('tab', { name: 'Inspect' }).getAttribute('aria-selected')).toBe('true')
    const inspectorSticky = await workbench.locator('.md-code-block').first().evaluate((block) => {
      let scroller = block.parentElement
      while (scroller !== null && !['auto', 'scroll'].includes(getComputedStyle(scroller).overflowY)) {
        scroller = scroller.parentElement
      }
      if (scroller === null) throw new Error('inspector scrollport missing')
      scroller.scrollTop = Math.min(300, scroller.scrollHeight - scroller.clientHeight)
      const banner = block.firstElementChild
      if (banner === null) throw new Error('CodeBlock banner missing')
      return {
        gap: Math.round(banner.getBoundingClientRect().top - scroller.getBoundingClientRect().top),
        scrollTop: scroller.scrollTop,
      }
    })
    expect(inspectorSticky.scrollTop).toBeGreaterThan(0)

    await workbench.getByRole('tab', { name: 'Changes', exact: true }).click()
    expect(await workbench.getByRole('tab', { name: 'Changes' }).getAttribute('aria-selected')).toBe('true')

    await page.setViewportSize({ width: 700, height: 900 })
    const dialog = page.getByRole('dialog', { name: 'Workbench' })
    await dialog.waitFor({ timeout: 10_000 })
    await page.waitForTimeout(350)
    const compactConversation = await conversationWidth(page)
    const compactSide = await dialog.getAttribute('data-side')
    await dialog.getByRole('button', { name: 'Close workbench', exact: true }).click()
    await dialog.waitFor({ state: 'hidden', timeout: 10_000 })
    await page.waitForTimeout(350)
    const closed = await conversationWidth(page) === 700

    await compareOrRefreshGolden(EXPECTED, renderGolden({
      inlineConversation, inlineWorkbench, tabs, inspectTitle,
      inspectorStickyGap: inspectorSticky.gap, changedCard, changedTree, changesSummary, changesAccordion,
      compactConversation, compactSide, closed,
    }), MODE)
    await assertFixtureInventory(SNAPSHOT_DIR, ['seed.jsonl', 'workbench.expected.md'])
    expect(tripwire.pageErrors).toEqual([])
    expect(tripwire.warnings).toEqual([])
  }, 90_000)
})
