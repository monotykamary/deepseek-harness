/**
 * Registration: the General row comes from one apply and defers until the
 * item slot has been declared; its injected face publishes the live opt-in
 * and routes the toggle's write through the bound settings scope.
 */

import { Context } from '@monotykamary/cordis'
import { describe, expect, it } from 'vitest'
import { SlotRegistry } from '@monotykamary/dsh-client-runtime/client'
import { LocaleRuntime } from '@monotykamary/dsh-client-locale/client'
import { TestRemote, usePinnedBrowserLanguages } from '@monotykamary/dsh-client-test-runtime'
import { apply, inject } from '@monotykamary/dsh-client-ui-session-title/client'
import { SessionTitleRow } from '../src/client/SessionTitleRow.tsx'
import type { SessionTitleRowInjected } from '../src/client/SessionTitleRow.tsx'

usePinnedBrowserLanguages('zh-CN')

/** A settings scope double recording the durable writes the row issues. */
function scopeDouble() {
  const listeners = new Set<() => void>()
  let value: { enabled: boolean } | undefined = undefined
  const writes: Array<{ field: string; value: unknown }> = []
  const snapshot = (): never => ({
    status: 'ready',
    value,
    base: undefined,
    user: undefined,
    revision: 1,
    writable: true,
    mode: 'host',
  }) as never
  return {
    writes,
    publish: (next: { enabled: boolean }): void => {
      value = next
      for (const listener of listeners) listener()
    },
    getSnapshot: snapshot,
    subscribe: (listener: () => void): (() => void) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    set: (field: string, next: unknown): Promise<void> => {
      writes.push({ field, value: next })
      value = { enabled: next as boolean }
      for (const listener of listeners) listener()
      return Promise.resolve()
    },
    unset: (): Promise<void> => {
      value = { enabled: false }
      for (const listener of listeners) listener()
      return Promise.resolve()
    },
    update: (): Promise<void> => Promise.resolve(),
    replace: (): Promise<void> => Promise.resolve(),
    mutate: (): Promise<void> => Promise.resolve(),
    load: (): Promise<void> => Promise.resolve(),
  }
}

async function bench(): Promise<{
  ctx: Context
  slots: SlotRegistry
  scope: ReturnType<typeof scopeDouble>
}> {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const locale = new LocaleRuntime(ctx)
  ctx.provide('locale', locale)
  new TestRemote(ctx)
  const scope = scopeDouble()
  ctx.provide('connection', { isLoopback: true, api: { settings: {} } } as never)
  ctx.provide('settingsScope', { bind: () => scope } as never)
  return { ctx, slots: ctx.get('slots') as SlotRegistry, scope }
}

function declareRoot(slots: SlotRegistry): void {
  slots.register({
    name: 'root',
    children: { 'settings.general.item': { kind: 'list', scope: 'root' } },
  } as never, () => null)
}

describe('ui-session-title apply', () => {
  it('declares the services it uses', () => {
    expect(inject).toEqual(['slots', 'locale', 'connection', 'remote', 'settingsScope'])
  })

  it('registers the General row for the session-title preference', async () => {
    const { ctx, slots } = await bench()
    declareRoot(slots)

    await ctx.plugin({ inject: [...inject], apply }).await()

    const row = slots.entries('settings.general.item')[0]!
    expect(row.component).toBe(SessionTitleRow)
    expect(row.options).toMatchObject({ id: 'session-title', order: 30 })
  })

  it('publishes the stored opt-in and routes toggle writes through the scope', async () => {
    const { ctx, slots, scope } = await bench()
    declareRoot(slots)
    await ctx.plugin({ inject: [...inject], apply }).await()

    const row = slots.entries('settings.general.item')[0]!
    const injected = (row.inject as unknown as () => SessionTitleRowInjected)()
    expect(injected.hooks.enabled.getSnapshot()).toBe(false)

    injected.setEnabled(true)
    expect(injected.hooks.enabled.getSnapshot()).toBe(true)
    expect(scope.writes).toEqual([{ field: 'enabled', value: true }])

    // A host-side change (another surface, the settings document) re-adopts.
    scope.publish({ enabled: true })
    expect(injected.hooks.enabled.getSnapshot()).toBe(true)
  })
})
