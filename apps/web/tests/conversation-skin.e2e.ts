// Keyless browser regression for the T3-adapted conversation palette, message
// hierarchy, composer glass, and responsive sidebar controls. A borrowed cold
// Session supplies one settled user/Assistant exchange; no model call runs.
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

const SEED = fileURLToPath(new URL('./snapshots/seeded-history/seed.jsonl', import.meta.url))
const SNAPSHOT_DIR = fileURLToPath(new URL('./snapshots/conversation-skin', import.meta.url))
const SKIN_EXPECTED = join(SNAPSHOT_DIR, 'skin.expected.md')
const SEED_ID = 'conversation-skin-web-e2e'
const MODE = webSnapshotMode()

interface PaletteMetrics {
  canvasToken: string
  canvas: string
  header: string
  divider: string
  composer: string
  composerBorder: string
  composerBackdrop: string
  composerRadius: string
  composerShadow: string
  message: string
  messageRadius: string
  messageFont: string
  messageLine: string
  messageMaxWidth: string
  assistantColor: string
  assistantFont: string
  assistantLine: string
  flowGap: string
  titleGap: string
  actionOpacity: string
}

interface RailMetrics {
  buttonCenters: Record<string, number>
  iconCenters: Record<string, number>
  buttonSizes: Record<string, string>
  aligned: boolean
}

interface DrawerMetrics {
  size: string
  iconSize: string
  border: string
  background: string
  radius: string
  titleCenterDelta: number
  titleLeadingGap: number
}

interface ResponsiveMetrics {
  desktopTracks: string
  tabletTracks: string
  compactTracks: string
  tabletReopens: boolean
  tabletRecollapses: boolean
  compactOpens: boolean
  compactDismisses: boolean
  compactChatOverflow: number
}

interface TrajectoryMetrics {
  paddingTop: string
  toolbarClearance: number
  fadeHeight: number
  clearsFade: boolean
}

/** Open the one cold-seeded Session without assuming whether its Workspace group starts expanded. */
async function openSeededSession(page: Page): Promise<void> {
  const group = page.locator('[role="treeitem"]').first()
  await group.waitFor({ timeout: 15_000 })
  if (await group.getAttribute('aria-expanded') !== 'true') await group.click()
  const session = page.locator('[role="treeitem"]').nth(1)
  await session.waitFor({ timeout: 15_000 })
  await session.click()
  await page.getByText('DONE', { exact: true }).waitFor({ timeout: 30_000 })
}

/** Measure the rendered palette and geometry after selecting one body theme state. */
async function measurePalette(page: Page, dark: boolean): Promise<PaletteMetrics> {
  await page.evaluate((enabled) => {
    if (enabled) document.body.setAttribute('data-ds-dark-theme', '')
    else document.body.removeAttribute('data-ds-dark-theme')
  }, dark)
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => { requestAnimationFrame(() => { resolve() }) })
    await new Promise<void>((resolve) => { requestAnimationFrame(() => { resolve() }) })
  })
  return await page.evaluate(() => {
    const scroll = document.querySelector<HTMLElement>('[data-conversation-scroll]')
    const root = scroll?.closest<HTMLElement>('[data-phase]')
    const header = root?.querySelector<HTMLElement>('header')
    const title = header?.firstElementChild
    const card = root?.querySelector<HTMLElement>('[data-composer-card]')
    const flow = root?.querySelector<HTMLElement>('[data-chat-flow]')
    const user = flow?.querySelector<HTMLElement>('[data-chat-flow-kind="user"] [data-time-hover-root]')
    const userStack = user?.firstElementChild
    const bubble = userStack?.lastElementChild
    const assistant = flow?.querySelector<HTMLElement>('[data-assistant-message]')
    const tail = flow?.querySelector<HTMLElement>('[data-chat-flow-kind="turn-tail"]')
    const copy = tail?.querySelector<HTMLButtonElement>('button[aria-label="Copy"]')
    const actions = copy?.parentElement
    if (!root || !header || !title || !card || !flow || !userStack || !bubble || !assistant || !actions) {
      const targets = { root, header, title, card, flow, userStack, bubble, assistant, actions }
      const missing = Object.entries(targets).filter(([, value]) => !value).map(([name]) => name)
      throw new Error(`conversation skin measurement target is missing: ${missing.join(', ')}`)
    }
    const body = getComputedStyle(document.body)
    const rootStyle = getComputedStyle(root)
    const headerStyle = getComputedStyle(header)
    const cardStyle = getComputedStyle(card)
    const bubbleStyle = getComputedStyle(bubble)
    const assistantStyle = getComputedStyle(assistant)
    return {
      canvasToken: body.getPropertyValue('--dsw-specific-conversation-canvas').trim(),
      canvas: rootStyle.backgroundColor,
      header: headerStyle.backgroundColor,
      divider: getComputedStyle(header, '::after').backgroundColor,
      composer: cardStyle.backgroundColor,
      composerBorder: cardStyle.borderColor,
      composerBackdrop: cardStyle.backdropFilter,
      composerRadius: cardStyle.borderRadius,
      composerShadow: cardStyle.boxShadow,
      message: bubbleStyle.backgroundColor,
      messageRadius: bubbleStyle.borderRadius,
      messageFont: bubbleStyle.fontSize,
      messageLine: bubbleStyle.lineHeight,
      messageMaxWidth: getComputedStyle(userStack).maxWidth,
      assistantColor: assistantStyle.color,
      assistantFont: assistantStyle.fontSize,
      assistantLine: assistantStyle.lineHeight,
      flowGap: getComputedStyle(flow).gap,
      titleGap: headerStyle.gap,
      actionOpacity: getComputedStyle(actions).opacity,
    }
  })
}

/** Measure all four rail controls after the 800px breakpoint settles. */
async function measureRail(page: Page): Promise<RailMetrics> {
  await page.setViewportSize({ width: 800, height: 900 })
  await page.locator('[data-sidebar-collapsed="true"]').waitFor({ timeout: 10_000 })
  await page.getByRole('button', { name: 'Open sidebar', exact: true }).waitFor({ timeout: 10_000 })
  await page.waitForTimeout(350)
  return await page.evaluate(() => {
    const labels = ['Open sidebar', 'New session', 'Search sessions', 'Add workspace']
    const buttonCenters: Record<string, number> = {}
    const iconCenters: Record<string, number> = {}
    const buttonSizes: Record<string, string> = {}
    for (const label of labels) {
      const button = [...document.querySelectorAll<HTMLButtonElement>('button')]
        .find(candidate => candidate.getAttribute('aria-label') === label)
      const icon = button?.querySelector('svg')
      if (!button || !icon) throw new Error(`rail control missing: ${label}`)
      const buttonRect = button.getBoundingClientRect()
      const iconRect = icon.getBoundingClientRect()
      buttonCenters[label] = Math.round((buttonRect.left + buttonRect.width / 2) * 100) / 100
      iconCenters[label] = Math.round((iconRect.left + iconRect.width / 2) * 100) / 100
      buttonSizes[label] = `${String(buttonRect.width)}×${String(buttonRect.height)}`
    }
    const centers = Object.values(buttonCenters)
    const iconValues = Object.values(iconCenters)
    return {
      buttonCenters,
      iconCenters,
      buttonSizes,
      aligned: centers.every(value => value === centers[0])
        && iconValues.every(value => value === iconValues[0]),
    }
  })
}

/** Measure the borderless mobile drawer action against the Session title row. */
async function measureDrawer(page: Page): Promise<DrawerMetrics> {
  await page.setViewportSize({ width: 500, height: 900 })
  await page.locator('[data-sidebar-drawer="true"]').waitFor({ timeout: 10_000 })
  const toggle = page.locator('[data-drawer-toggle]')
  await toggle.waitFor({ timeout: 10_000 })
  expect(await toggle.getAttribute('aria-label')).toBe('Open sidebar')
  await expect.poll(async () => await page.evaluate(() => (
    document.querySelector('[data-conversation-scroll]')?.closest('[data-phase]')
      ?.getBoundingClientRect().left
  )), { timeout: 10_000 }).toBe(0)
  return await page.evaluate(() => {
    const toggle = document.querySelector<HTMLElement>('[data-drawer-toggle]')
    const header = document.querySelector<HTMLElement>('[data-conversation-scroll]')
      ?.closest<HTMLElement>('[data-phase]')?.querySelector<HTMLElement>('header')
    const title = header?.firstElementChild
    const nav = header?.querySelector<HTMLElement>('nav[aria-label="Session hierarchy"]')
    const icon = toggle?.querySelector('svg')
    if (!toggle || !header || !title || !nav || !icon) {
      const targets = { toggle, header, title, nav, icon }
      const missing = Object.entries(targets).filter(([, value]) => !value).map(([name]) => name)
      throw new Error(`compact header measurement target is missing: ${missing.join(', ')}`)
    }
    const toggleRect = toggle.getBoundingClientRect()
    const titleRect = title.getBoundingClientRect()
    const navRect = nav.getBoundingClientRect()
    const iconRect = icon.getBoundingClientRect()
    const style = getComputedStyle(toggle)
    return {
      size: `${String(toggleRect.width)}×${String(toggleRect.height)}`,
      iconSize: `${String(iconRect.width)}×${String(iconRect.height)}`,
      border: `${style.borderWidth} ${style.borderStyle}`,
      background: style.backgroundColor,
      radius: style.borderRadius,
      titleCenterDelta: Math.round(Math.abs(
        toggleRect.top + toggleRect.height / 2 - titleRect.top - titleRect.height / 2,
      ) * 100) / 100,
      titleLeadingGap: Math.round((navRect.left - toggleRect.right) * 100) / 100,
    }
  })
}

/** Exercise all three sidebar modes and measure the compact Chat width. */
async function measureResponsiveDisclosure(page: Page): Promise<ResponsiveMetrics> {
  const tracks = async (): Promise<string> => await page.evaluate(() => {
    const frame = document.querySelector<HTMLElement>('[data-details-collapsed]')
    const conversation = document.querySelector<HTMLElement>('[data-conversation-scroll]')
      ?.closest<HTMLElement>('[data-phase]')
    if (!frame || !conversation) throw new Error('responsive frame target is missing')
    const frameRect = frame.getBoundingClientRect()
    const conversationRect = conversation.getBoundingClientRect()
    return `${String(Math.round(conversationRect.left - frameRect.left))}px + ${String(Math.round(conversationRect.width))}px`
  })

  await page.setViewportSize({ width: 1200, height: 900 })
  await expect.poll(tracks, { timeout: 10_000 }).toBe('280px + 920px')
  const desktopTracks = await tracks()

  await page.setViewportSize({ width: 800, height: 900 })
  await page.locator('[data-sidebar-collapsed="true"]').waitFor({ timeout: 10_000 })
  await expect.poll(tracks, { timeout: 10_000 }).toBe('56px + 744px')
  const tabletTracks = await tracks()
  await page.getByRole('button', { name: 'Open sidebar', exact: true }).click()
  await expect.poll(tracks, { timeout: 10_000 }).toBe('280px + 520px')
  const tabletReopens = await page.getByRole('button', { name: 'Collapse sidebar', exact: true }).isVisible()
  await page.getByRole('button', { name: 'Collapse sidebar', exact: true }).click()
  await expect.poll(tracks, { timeout: 10_000 }).toBe('56px + 744px')
  const tabletRecollapses = await page.getByRole('button', { name: 'Open sidebar', exact: true }).isVisible()

  await page.setViewportSize({ width: 700, height: 900 })
  const frame = page.locator('[data-sidebar-drawer="true"]')
  await frame.waitFor({ timeout: 10_000 })
  await expect.poll(tracks, { timeout: 10_000 }).toBe('0px + 700px')
  expect(await frame.getAttribute('data-sidebar-collapsed')).toBeNull()
  const compactTracks = await tracks()
  await page.getByRole('button', { name: 'Open sidebar', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Sidebar' })
  await dialog.waitFor({ timeout: 10_000 })
  const compactOpens = await dialog.isVisible()
  await dialog.getByRole('button', { name: 'Collapse sidebar', exact: true }).click()
  await dialog.waitFor({ state: 'hidden', timeout: 10_000 })
  const compactDismisses = await page.getByRole('button', { name: 'Open sidebar', exact: true }).isVisible()

  await page.setViewportSize({ width: 390, height: 900 })
  await page.getByRole('tab', { name: 'Chat', exact: true }).click()
  await expect.poll(tracks, { timeout: 10_000 }).toBe('0px + 390px')
  const compactChatOverflow = await page.evaluate(() => {
    const scroll = document.querySelector<HTMLElement>('[data-conversation-scroll]')
    if (!scroll) throw new Error('conversation scroll target is missing')
    return scroll.scrollWidth - scroll.clientWidth
  })
  return {
    desktopTracks, tabletTracks, compactTracks,
    tabletReopens, tabletRecollapses, compactOpens, compactDismisses,
    compactChatOverflow,
  }
}

/** Measure the Trajectory toolbar against the conversation-owned fade band. */
async function measureTrajectory(page: Page): Promise<TrajectoryMetrics> {
  await page.setViewportSize({ width: 1200, height: 900 })
  await page.getByRole('tab', { name: 'Trajectory', exact: true }).click()
  const toolbar = page.getByRole('toolbar', { name: 'Trajectory toolbar' })
  await toolbar.waitFor({ timeout: 10_000 })
  return await toolbar.evaluate((element) => {
    const scroll = document.querySelector<HTMLElement>('[data-conversation-scroll]')
    const view = element.parentElement
    if (!scroll || !view) throw new Error('Trajectory clearance target is missing')
    const toolbarClearance = Math.round(
      (element.getBoundingClientRect().top - scroll.getBoundingClientRect().top) * 100,
    ) / 100
    const fadeHeight = Number.parseFloat(
      getComputedStyle(view).getPropertyValue('--dsh-conversation-top-fade-height'),
    )
    return {
      paddingTop: getComputedStyle(view).paddingTop,
      toolbarClearance,
      fadeHeight,
      clearsFade: toolbarClearance >= fadeHeight,
    }
  })
}

/** Render a reviewable computed-style and responsive-geometry golden. */
function renderSkin(
  light: PaletteMetrics,
  dark: PaletteMetrics,
  rail: RailMetrics,
  drawer: DrawerMetrics,
  responsive: ResponsiveMetrics,
  trajectory: TrajectoryMetrics,
): string {
  const palette = (name: string, value: PaletteMetrics): string[] => [
    `## ${name}`,
    '',
    `- canvas token: ${value.canvasToken}`,
    `- conversation canvas: ${value.canvas}`,
    `- header canvas: ${value.header}`,
    `- header divider: ${value.divider}`,
    `- composer fill: ${value.composer}`,
    `- composer outline: ${value.composerBorder}`,
    `- composer backdrop: ${value.composerBackdrop}`,
    `- composer radius: ${value.composerRadius}`,
    `- composer shadow: ${value.composerShadow}`,
    `- user message: ${value.message}`,
    `- user message radius: ${value.messageRadius}`,
    `- user message typography: ${value.messageFont}/${value.messageLine}`,
    `- user message maximum width: ${value.messageMaxWidth}`,
    `- Assistant prose: ${value.assistantColor}, ${value.assistantFont}/${value.assistantLine}`,
    `- transcript gap: ${value.flowGap}`,
    `- title-to-tabs gap: ${value.titleGap}`,
    `- settled actions at rest: opacity ${value.actionOpacity}`,
    '',
  ]
  const entries = (values: Record<string, string | number>): string => Object.entries(values)
    .map(([key, value]) => `${key}=${String(value)}`).join(', ')
  return [
    '# T3-adapted conversation skin',
    '',
    ...palette('Light palette', light),
    ...palette('Dark palette', dark),
    '## Tablet rail at 800px',
    '',
    `- button centers: ${entries(rail.buttonCenters)}`,
    `- icon centers: ${entries(rail.iconCenters)}`,
    `- button sizes: ${entries(rail.buttonSizes)}`,
    `- all centers aligned: ${String(rail.aligned)}`,
    '',
    '## Compact drawer at 500px',
    '',
    `- action size: ${drawer.size}`,
    `- panel icon size: ${drawer.iconSize}`,
    `- resting border: ${drawer.border}`,
    `- resting background: ${drawer.background}`,
    `- radius: ${drawer.radius}`,
    `- title-row center delta: ${String(drawer.titleCenterDelta)}px`,
    `- gap before Session title: ${String(drawer.titleLeadingGap)}px`,
    '',
    '## Progressive sidebar disclosure',
    '',
    `- desktop tracks at 1200px: ${responsive.desktopTracks}`,
    `- tablet tracks at 800px: ${responsive.tabletTracks}`,
    `- compact tracks at 700px: ${responsive.compactTracks}`,
    `- tablet rail reopens: ${String(responsive.tabletReopens)}`,
    `- tablet rail recollapses: ${String(responsive.tabletRecollapses)}`,
    `- compact drawer opens: ${String(responsive.compactOpens)}`,
    `- compact drawer dismisses: ${String(responsive.compactDismisses)}`,
    `- compact Chat horizontal overflow: ${String(responsive.compactChatOverflow)}px`,
    '',
    '## Trajectory top fade clearance',
    '',
    `- view padding: ${trajectory.paddingTop}`,
    `- toolbar clearance: ${String(trajectory.toolbarClearance)}px`,
    `- fade height: ${String(trajectory.fadeHeight)}px`,
    `- toolbar clears fade: ${String(trajectory.clearsFade)}`,
  ].join('\n').trimEnd()
}

describe('web e2e: T3-adapted conversation skin', () => {
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
    await page.goto(scaffold.baseUrl, { waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
    await openSeededSession(page)
  }, 120_000)

  afterAll(async () => {
    await browser?.close()
    await scaffold?.close()
  })

  it.skipIf(MODE === 'record')('renders both palettes, progressive sidebar modes, and clear Trajectory chrome', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-conversation-skin'))
    const light = await measurePalette(page, false)
    const dark = await measurePalette(page, true)

    const assistant = page.locator('[data-chat-flow-kind="assistant-step"]').last()
    const tailCopy = page.locator('[data-chat-flow-kind="turn-tail"] button[aria-label="Copy"]').last()
    await assistant.hover()
    await expect.poll(async () => await tailCopy.evaluate(button => getComputedStyle(button.parentElement!).opacity))
      .toBe('1')
    await page.mouse.move(0, 0)
    await expect.poll(async () => await tailCopy.evaluate(button => getComputedStyle(button.parentElement!).opacity))
      .toBe('0')

    const rail = await measureRail(page)
    const drawer = await measureDrawer(page)
    const responsive = await measureResponsiveDisclosure(page)
    const trajectory = await measureTrajectory(page)
    expect(rail.aligned).toBe(true)
    expect(drawer.titleCenterDelta).toBe(0)
    expect(drawer.titleLeadingGap).toBe(10)
    expect(drawer.border).toBe('0px none')
    expect(drawer.background).toBe('rgba(0, 0, 0, 0)')
    expect(responsive.compactChatOverflow).toBe(0)
    expect(trajectory.clearsFade).toBe(true)

    await compareOrRefreshGolden(
      SKIN_EXPECTED,
      renderSkin(light, dark, rail, drawer, responsive, trajectory),
      MODE,
    )
    await assertFixtureInventory(SNAPSHOT_DIR, ['skin.expected.md'])
    expect(tripwire.pageErrors).toEqual([])
    expect(tripwire.warnings).toEqual([])
  }, 90_000)
})
