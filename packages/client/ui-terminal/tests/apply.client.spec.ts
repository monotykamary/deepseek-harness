// @vitest-environment jsdom
import { Context, Service } from '@monotykamary/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import { LocaleRuntime } from '@monotykamary/dsh-client-locale/client'
import { SlotRegistry, type SessionId } from '@monotykamary/dsh-client-runtime/client'
import { resolveSlotLabel } from '@monotykamary/dsh-client-ui-slots'
import { usePinnedBrowserLanguages } from '@monotykamary/dsh-client-test-runtime'
import { apply, inject } from '../src/client/index.ts'
import { apply as applyNode } from '../src/index.ts'
import { NS } from '../src/client/locales.ts'
import { BottomTerminalToggle } from '../src/client/BottomTerminalToggle.tsx'
import { BottomTerminal, WorkbenchTerminal } from '../src/client/TerminalPanel.tsx'
import { DEFAULT_TERMINAL_PREFERENCES } from '../src/client/preferences.ts'
import type { BottomTerminalToggleInjected, TerminalInjected } from '../src/client/contract.ts'

usePinnedBrowserLanguages('zh-CN')
afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals() })

async function bench() {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const locale = new LocaleRuntime(ctx)
  ctx.provide('locale', locale)
  class WorkbenchService extends Service {
    readonly open = vi.fn()
    readonly openNew = vi.fn()
    readonly ensureCount = vi.fn()
    readonly show = vi.fn()
    readonly close = vi.fn()
    readonly registerPresentation = vi.fn((
      _id: string,
      _presentation: { icon: string; description: string | (() => string) },
    ) => () => {})
    constructor(serviceCtx: Context) { super(serviceCtx, 'workbench') }
  }
  class LayoutService extends Service {
    readonly toggleSidebar = vi.fn()
    readonly openDetails = vi.fn()
    readonly closeDetails = vi.fn()
    readonly openBottom = vi.fn()
    readonly closeBottom = vi.fn()
    readonly toggleBottom = vi.fn()
    constructor(serviceCtx: Context) { super(serviceCtx, 'layout') }
  }
  // Minimal theme stand-in: the plugin reads getTheme() once and follows
  // the theme/change event, so the bench drives the source through ctx.emit.
  const theme = {
    getTheme: () => ({ active: { colorScheme: 'dark' as const } }),
  }
  const workbench = new WorkbenchService(ctx)
  const layout = new LayoutService(ctx)
  ctx.provide('theme', theme)
  return { ctx, slots: ctx.get('slots') as SlotRegistry, locale, workbench, layout, theme }
}

function declare(slots: SlotRegistry): () => void {
  return slots.register({
    name: 'root',
    children: {
      'workbench.surface': { kind: 'list', scope: 'session' },
      'bottom-panel': { kind: 'single', scope: 'session' },
      'conversation.session.header.utilities': { kind: 'list', scope: 'session' },
    },
  } as never, () => null)
}

describe('ui-terminal browser plugin', () => {
  it('keeps the Host half empty and declares only services it reads', () => {
    applyNode()
    expect(inject).toEqual(['slots', 'locale', 'workbench', 'layout', 'theme'])
  })

  it('registers both terminal placements, presentation, preferences, and header toggle', async () => {
    const b = await bench()
    declare(b.slots)
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    const surface = b.slots.entries('workbench.surface')[0]!
    const bottom = b.slots.entries('bottom-panel')[0]!
    const toggle = b.slots.entries('conversation.session.header.utilities')[0]!

    expect(surface.component).toBe(WorkbenchTerminal)
    expect(surface.options).toMatchObject({ id: 'terminal', order: 30 })
    expect(surface.locale).toBe(NS)
    expect(resolveSlotLabel(surface.options.label)).toBe('终端')
    expect(bottom.component).toBe(BottomTerminal)
    expect(bottom.locale).toBe(NS)
    expect(toggle.component).toBe(BottomTerminalToggle)
    expect(toggle.options).toMatchObject({ id: 'bottom-terminal', order: 90 })
    expect(b.workbench.registerPresentation).toHaveBeenCalledOnce()
    const [presentationId, presentation] = b.workbench.registerPresentation.mock.calls[0]!
    expect(presentationId).toBe('terminal')
    expect(presentation.icon).toBe('terminal')
    expect((presentation.description as () => string)()).toBe('打开交互式持久终端')

    const sessionId = 'session' as SessionId
    const rightInjected = (surface.inject as unknown as (id: SessionId) => TerminalInjected)(sessionId)
    const bottomInjected = (bottom.inject as unknown as (id: SessionId) => TerminalInjected)(sessionId)
    expect(rightInjected.hooks.preferences).toBe(bottomInjected.hooks.preferences)
    expect(rightInjected.hooks.colorScheme).toBe(bottomInjected.hooks.colorScheme)
    expect(rightInjected.hooks.colorScheme.getSnapshot()).toBe('dark')
    expect(rightInjected.socketFactory).toBeTypeOf('function')
    const socket = {}
    vi.stubGlobal('WebSocket', vi.fn(function WebSocketStub() { return socket }))
    expect(rightInjected.socketFactory('wss://terminal.test')).toBe(socket)
    rightInjected.openWorkbenchPanel()
    rightInjected.ensureWorkbenchPanels(3)
    bottomInjected.ensureWorkbenchPanels(4)
    expect(b.workbench.openNew).toHaveBeenCalledWith(sessionId, 'terminal')
    expect(b.workbench.ensureCount).toHaveBeenCalledOnce()
    expect(b.workbench.ensureCount).toHaveBeenCalledWith(sessionId, 'terminal', 3)
    const listener = vi.fn()
    rightInjected.hooks.preferences.subscribe(listener)
    rightInjected.updatePreferences({ ligatures: false })
    expect(rightInjected.hooks.preferences.getSnapshot()).toMatchObject({ ligatures: false })
    expect(listener).toHaveBeenCalledOnce()
    bottomInjected.resetPreferences()
    expect(bottomInjected.hooks.preferences.getSnapshot()).toEqual(DEFAULT_TERMINAL_PREFERENCES)

    const schemeListener = vi.fn()
    rightInjected.hooks.colorScheme.subscribe(schemeListener)
    b.ctx.emit('theme/change', { active: { colorScheme: 'light' } } as never)
    expect(rightInjected.hooks.colorScheme.getSnapshot()).toBe('light')
    expect(schemeListener).toHaveBeenCalledOnce()
    b.ctx.emit('theme/change', { active: { colorScheme: 'light' } } as never)
    expect(schemeListener).toHaveBeenCalledOnce()

    const toggleInjected = (toggle.inject as unknown as () => BottomTerminalToggleInjected)()
    toggleInjected.toggleBottomTerminal()
    expect(b.layout.toggleBottom).toHaveBeenCalledOnce()
    await b.ctx.fiber.dispose()
  })

  it('follows declaration, locale, and plugin disposal lifetimes', async () => {
    const b = await bench()
    const fiber = b.ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    expect(b.slots.entries('bottom-panel')).toHaveLength(0)
    const stop = declare(b.slots)
    await vi.waitFor(() => { expect(b.slots.entries('workbench.surface')).toHaveLength(1) })
    b.locale.setLocale('en')
    expect(resolveSlotLabel(b.slots.entries('workbench.surface')[0]!.options.label)).toBe('Terminal')
    stop()
    expect(b.slots.entries('workbench.surface')).toHaveLength(0)
    declare(b.slots)
    await vi.waitFor(() => { expect(b.slots.entries('bottom-panel')[0]?.component).toBe(BottomTerminal) })
    await fiber.dispose()
    expect(b.slots.entries('workbench.surface')).toHaveLength(0)
    expect(b.slots.entries('bottom-panel')).toHaveLength(0)
    expect(b.slots.entries('conversation.session.header.utilities')).toHaveLength(0)
    await b.ctx.fiber.dispose()
  })
})
