// @vitest-environment jsdom
import { Context, Service } from '@monotykamary/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import { LocaleRuntime } from '@monotykamary/dsh-client-locale/client'
import { SlotRegistry } from '@monotykamary/dsh-client-runtime/client'
import type { SessionId } from '@monotykamary/dsh-client-runtime/client'
import { resolveSlotLabel } from '@monotykamary/dsh-client-ui-slots'
import { usePinnedBrowserLanguages } from '@monotykamary/dsh-client-test-runtime'
import { apply, inject } from '../src/client/index.ts'
import { apply as applyNode } from '../src/index.ts'
import { NS } from '../src/client/locales.ts'
import { FilesPanel } from '../src/client/FilesPanel.tsx'
import { FilesHeaderAction } from '../src/client/FilesHeaderAction.tsx'
import type { FilesHeaderInjected, FilesInjected } from '../src/client/contract.ts'

usePinnedBrowserLanguages('zh-CN')
afterEach(cleanup)

const listing = { directory: { segments: [] }, entries: [], truncated: false }
const preview = {
  kind: 'text' as const, file: { segments: ['a.ts'] }, name: 'a.ts', content: 'a', byteLength: 1,
}
type Result<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: { readonly code: string; readonly message: string } }

async function bench() {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const locale = new LocaleRuntime(ctx)
  ctx.provide('locale', locale)
  class RemoteService extends Service {
    constructor(serviceCtx: Context) { super(serviceCtx, 'remote') }
  }
  class WorkbenchService extends Service {
    readonly open = vi.fn()
    close(): void {}
    constructor(serviceCtx: Context) { super(serviceCtx, 'workbench') }
  }
  new RemoteService(ctx)
  const workbench = new WorkbenchService(ctx)
  const list = vi.fn<() => Promise<Result<typeof listing>>>().mockResolvedValue({ ok: true, value: listing })
  const read = vi.fn<() => Promise<Result<typeof preview>>>().mockResolvedValue({ ok: true, value: preview })
  ctx.provide('remote.workspaceFiles', { list, read })
  return { ctx, slots: ctx.get('slots') as SlotRegistry, locale, workbench, list, read }
}

function declare(slots: SlotRegistry): () => void {
  return slots.register({
    name: 'root',
    children: {
      'workbench.surface': { kind: 'list', scope: 'session' },
      'conversation.session.header.actions': { kind: 'list', scope: 'session' },
    },
  } as never, () => null)
}

describe('ui-files browser plugin', () => {
  it('keeps the Host half empty', () => {
    applyNode()
  })

  it('declares only the services it reads', () => {
    expect(inject).toEqual(['slots', 'locale', 'workbench', 'remote', 'remote.workspaceFiles'])
  })

  it('registers Files in the workbench and session header with bound Remote calls', async () => {
    const b = await bench()
    declare(b.slots)
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    const surface = b.slots.entries('workbench.surface')[0]!
    const action = b.slots.entries('conversation.session.header.actions')[0]!
    expect(surface.component).toBe(FilesPanel)
    expect(surface.options).toMatchObject({ id: 'files', order: 20 })
    expect(surface.store).toBeDefined()
    expect(surface.locale).toBe(NS)
    expect(resolveSlotLabel(surface.options.label)).toBe('文件')
    expect(action.component).toBe(FilesHeaderAction)
    expect(action.options).toMatchObject({ id: 'workspace-files', order: 30 })

    const sid = 's' as SessionId
    const files = (surface.inject as unknown as (id: SessionId) => FilesInjected)(sid)
    const signal = new AbortController().signal
    await expect(files.list({ segments: [] }, signal)).resolves.toEqual(listing)
    await expect(files.read({ segments: ['a.ts'] }, signal)).resolves.toEqual(preview)
    expect(b.list).toHaveBeenCalledWith(sid, { segments: [] }, signal)
    expect(b.read).toHaveBeenCalledWith(sid, { segments: ['a.ts'] }, signal)

    const header = (action.inject as unknown as () => FilesHeaderInjected)()
    header.openFiles()
    expect(b.workbench.open).toHaveBeenCalledWith('files')
    await b.ctx.fiber.dispose()
  })

  it('normalizes Remote failures and follows declaration, locale, and disposal lifetimes', async () => {
    const b = await bench()
    const fiber = b.ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    expect(b.slots.entries('workbench.surface')).toHaveLength(0)
    const stop = declare(b.slots)
    await vi.waitFor(() => { expect(b.slots.entries('workbench.surface')).toHaveLength(1) })
    b.locale.setLocale('en')
    const entry = b.slots.entries('workbench.surface')[0]!
    expect(resolveSlotLabel(entry.options.label)).toBe('Files')
    const files = (entry.inject as unknown as (id: SessionId) => FilesInjected)('s' as SessionId)
    b.list.mockResolvedValueOnce({ ok: false, error: { code: 'denied', message: 'no access' } })
    b.read.mockResolvedValueOnce({ ok: false, error: { code: 'missing', message: 'gone' } })
    await expect(files.list({ segments: [] })).rejects.toThrow('workspaceFiles.list failed: denied: no access')
    await expect(files.read({ segments: ['gone'] })).rejects.toThrow('workspaceFiles.read failed: missing: gone')

    stop()
    expect(b.slots.entries('workbench.surface')).toHaveLength(0)
    declare(b.slots)
    await vi.waitFor(() => { expect(b.slots.entries('workbench.surface')[0]?.component).toBe(FilesPanel) })
    await fiber.dispose()
    expect(b.slots.entries('workbench.surface')).toHaveLength(0)
    expect(b.slots.entries('conversation.session.header.actions')).toHaveLength(0)
    await b.ctx.fiber.dispose()
  })
})
