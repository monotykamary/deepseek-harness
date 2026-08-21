// Web e2e scenario: the operator-eligible settings plane through a trusted
// non-loopback authority. The scaffold boots `dsh.localhost` — a name the
// browser resolves to loopback (RFC 6761) but the client-side loopback
// classifier never accepts — as a deployment-trusted authority, exactly the
// portless surface `dsh web --portless` serves at https://dsh.localhost.
// Before the operator-eligibility handshake existed, this origin's settings
// mirror stayed process-local and the Models page failed with "settings are
// unavailable in this browser"; the plane must now load from the trusted
// surface. The scenario sweeps every settings section and asserts the
// pre-fix failure text never appears, so a regression in any one section
// fails the guard. Zero model calls: the join is settings/llm-domain traffic
// only.
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest'
import { launchWebScaffold, watchConsole, type WebScaffold } from './scaffold.ts'
import { ZH_BROWSER_LOCALE, saveFailureShot } from './support.ts'

describe('web e2e: settings plane on a trusted non-loopback surface', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  let tripwire: ReturnType<typeof watchConsole>

  beforeAll(async () => {
    scaffold = await launchWebScaffold({ remoteAuthority: 'dsh.localhost' })
    browser = await chromium.launch()
    // The scenario asserts the shipped Chinese copy, so the browser asks for it.
    page = await browser.newPage({ viewport: { width: 1680, height: 1000 }, locale: ZH_BROWSER_LOCALE })
    tripwire = watchConsole(page)
    await page.goto(scaffold.baseUrl, { waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
  }, 120_000)

  afterAll(async () => {
    await browser?.close()
    await scaffold?.close()
  })

  it('loads every settings section from the trusted surface', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-trusted-surface-settings'))
    await page.getByRole('button', { name: '设置', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: '设置' })
    await dialog.waitFor({ timeout: 10_000 })
    // The pre-fix failure text must never appear anywhere in the dialog.
    const providerDirectoryFailed = dialog.getByText('加载提供方目录失败', { exact: false })
    const expectSection = async (nav: string, stableCopy: string): Promise<void> => {
      await dialog.getByRole('button', { name: nav, exact: true }).click()
      // Each section renders its own stable copy only after its store answered
      // from the Host document — the join landed.
      await dialog.getByText(stableCopy, { exact: false }).waitFor({ timeout: 10_000 })
      expect(await providerDirectoryFailed.count()).toBe(0)
      expect(tripwire.pageErrors).toEqual([])
    }
    await expectSection('通用设置', '打开配置文件')
    await expectSection('模型', '填入各提供方的 API 密钥即可使用其模型。')
    await expectSection('插件', '配置和查看本部署已安装的插件。')
    await expectSection('Agent 预设', '预设即一个会话的 Agent 所运行的插件组装')
  }, 90_000)
})
