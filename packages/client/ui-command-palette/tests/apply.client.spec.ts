import { Context } from '@monotykamary/cordis'
import { describe, expect, it, vi } from 'vitest'
import { SlotRegistry } from '@monotykamary/dsh-client-runtime/client'
import { LocaleRuntime } from '@monotykamary/dsh-client-locale/client'
import type { CommandPaletteInjected } from '@monotykamary/dsh-client-ui-command-palette/client'
import { apply, inject } from '@monotykamary/dsh-client-ui-command-palette/client'
import { CommandPalette } from '../src/client/CommandPalette.tsx'

async function bench() {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const open = vi.fn()
  const startSession = vi.fn()
  const connectWorkspace = vi.fn(async () => 'session-new')
  const search = vi.fn(async () => ({
    ok: true as const,
    value: { items: [{ sessionId: 'session', snippet: 'match' }], hasMore: false },
  }))
  ctx.provide('sessions', { open, search, searchResultLimit: 20 } as never)
  ctx.provide('workspaces', { startSession, connectWorkspace } as never)
  const locale = new LocaleRuntime(ctx)
  locale.setLocale('zh')
  ctx.provide('locale', locale)
  return { ctx, slots: ctx.get('slots') as SlotRegistry, open, startSession, connectWorkspace, search, locale }
}

function declare(slots: SlotRegistry): () => void {
  return slots.register({
    name: 'root', children: { 'shell.overlay': { kind: 'list', scope: 'root' } },
  } as never, () => null)
}

describe('ui-command-palette apply', () => {
  it('declares only the services it uses', () => {
    expect(inject).toEqual(['slots', 'sessions', 'workspaces', 'locale'])
  })

  it('registers before or after the shell declaration and binds localized copy', async () => {
    const before = await bench()
    declare(before.slots)
    await before.ctx.plugin({ inject: [...inject], apply }).await()
    expect(before.slots.entries('shell.overlay')[0]?.component).toBe(CommandPalette)
    expect(before.slots.entries('shell.overlay')[0]?.locale).toBe('commandPalette')
    expect(before.locale.bind('commandPalette')('dialog.aria')).toBe('命令面板')

    const after = await bench()
    await after.ctx.plugin({ inject: [...inject], apply }).await()
    declare(after.slots)
    await Promise.resolve()
    expect(after.slots.entries('shell.overlay')[0]?.component).toBe(CommandPalette)
  })

  it('routes injected operations through Session and Workspace services', async () => {
    const b = await bench()
    declare(b.slots)
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    const face = (b.slots.entries('shell.overlay')[0]?.inject as unknown as () => CommandPaletteInjected)()
    face.openSession('existing' as never)
    expect(b.open).toHaveBeenCalledWith('existing')
    await face.startSession('workspace' as never)
    expect(b.connectWorkspace).toHaveBeenCalledWith('workspace')
    expect(b.open).toHaveBeenLastCalledWith('session-new')
    await face.startSession()
    expect(b.startSession).toHaveBeenCalledWith()
    const signal = new AbortController().signal
    await expect(face.searchSessions('match', signal)).resolves.toEqual({
      items: [{ sessionId: 'session', snippet: 'match' }], hasMore: false,
    })
    expect(b.search).toHaveBeenCalledWith('match', signal)
    expect(face.searchResultLimit).toBe(20)
  })

  it('rejects a Host search error and retracts the entry on teardown', async () => {
    const b = await bench()
    b.search.mockResolvedValueOnce({
      ok: false, error: { code: 'internal', message: 'index unavailable', details: {} },
    } as never)
    declare(b.slots)
    const fiber = b.ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    const face = (b.slots.entries('shell.overlay')[0]?.inject as unknown as () => CommandPaletteInjected)()
    await expect(face.searchSessions('needle', new AbortController().signal)).rejects.toThrow('index unavailable')
    await fiber.dispose()
    expect(b.slots.entries('shell.overlay')).toHaveLength(0)
  })
})
