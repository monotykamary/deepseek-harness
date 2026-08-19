// @vitest-environment jsdom
import { Context, Service } from '@monotykamary/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import { LocaleRuntime } from '@monotykamary/dsh-client-locale/client'
import { SlotRegistry } from '@monotykamary/dsh-client-runtime/client'
import { resolveSlotLabel } from '@monotykamary/dsh-client-ui-slots'
import { usePinnedBrowserLanguages } from '@monotykamary/dsh-client-test-runtime'
import { apply, inject } from '../src/client/index.ts'
import { apply as applyNode } from '../src/index.ts'
import { NS } from '../src/client/locales.ts'
import { BottomTerminalToggle } from '../src/client/BottomTerminalToggle.tsx'
import { BottomTerminal, WorkbenchTerminal } from '../src/client/TerminalPanel.tsx'
import type { BottomTerminalToggleInjected, TerminalInjected } from '../src/client/contract.ts'

usePinnedBrowserLanguages('zh-CN')
afterEach(() => { cleanup(); localStorage.clear() })

async function bench() {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const locale = new LocaleRuntime(ctx)
  ctx.provide('locale', locale)
  class WorkbenchService extends Service {
    readonly open = vi.fn()
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
  const workbench = new WorkbenchService(ctx)
  const layout = new LayoutService(ctx)
  return { ctx, slots: ctx.get('slots') as SlotRegistry, locale, workbench, layout }
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
    expect(inject).toEqual(['slots', 'locale', 'workbench', 'layout'])
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

    const rightInjected = (surface.inject as unknown as () => TerminalInjected)()
    const bottomInjected = (bottom.inject as unknown as () => TerminalInjected)()
    expect(rightInjected.hooks.preferences).toBe(bottomInjected.hooks.preferences)
    expect(rightInjected.socketFactory).toBeTypeOf('function')
    const listener = vi.fn()
    rightInjected.hooks.preferences.subscribe(listener)
    rightInjected.updatePreferences({ theme: 'light', ligatures: false })
    expect(rightInjected.hooks.preferences.getSnapshot()).toMatchObject({ theme: 'light', ligatures: false })
    expect(listener).toHaveBeenCalledOnce()
    bottomInjected.resetPreferences()
    expect(bottomInjected.hooks.preferences.getSnapshot().theme).toBe('harness')

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
