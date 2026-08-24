// @vitest-environment jsdom
import { Context } from '@monotykamary/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createSnapshotStore,
  type SessionId,
  type SessionListState,
  type SessionSummary,
  type SettingsScope,
  type SettingsScopeSnapshot,
} from '@monotykamary/dsh-client-runtime/client'
import type { WorkspaceSettings } from '../src/settled-settings.ts'
import { SessionDispositionService } from '../src/client/session-disposition.ts'

const sid = (value: string): SessionId => value as SessionId
const summary = (id: string, updatedAt: number, over: Partial<SessionSummary> = {}): SessionSummary => ({
  id: sid(id), displayTitle: id, running: false, blank: false, updatedAt, ...over,
})

function sessionState(items: readonly SessionSummary[]): SessionListState {
  return {
    ids: items.map(item => item.id),
    byId: Object.fromEntries(items.map(item => [item.id, item])),
    current: undefined,
    phase: 'ready',
    subagentsByParent: {},
    jobsBySession: {},
    currentAddress: undefined,
  }
}

function settings(value: WorkspaceSettings): SettingsScopeSnapshot<WorkspaceSettings> {
  return {
    status: 'ready', value, base: {}, user: {}, revision: 1,
    writable: true, mode: 'host',
  }
}

async function bench(items: readonly SessionSummary[], value: WorkspaceSettings = {
  autoSettleInactive: true,
  autoSettleAfterDays: 3,
}) {
  const ctx = new Context()
  const sessions = createSnapshotStore(sessionState(items))
  const policy = createSnapshotStore(settings(value))
  ctx.provide('sessions', { list: sessions } as never)
  let service: SessionDispositionService | undefined
  const fiber = ctx.plugin({
    inject: ['sessions'],
    apply(scope) { service = new SessionDispositionService(scope, policy as SettingsScope<WorkspaceSettings>) },
  })
  await fiber.await()
  if (service === undefined) throw new Error('Session disposition service did not mount')
  return { ctx, fiber, service, sessions, policy }
}

afterEach(() => {
  localStorage.clear()
  vi.useRealTimers()
})

describe('SessionDispositionService', () => {
  it('publishes automatic and explicit settlement from one persisted override source', async () => {
    vi.useFakeTimers()
    const now = new Date('2026-08-24T12:00:00.000Z').getTime()
    vi.setSystemTime(now)
    const day = 86_400_000
    const first = await bench([summary('stale', now - 4 * day), summary('active', now - day)])

    expect(first.service.state.getSnapshot().settledSessionIds).toEqual([sid('stale')])
    first.service.settleSession(sid('active'))
    expect(first.service.state.getSnapshot().settledSessionIds).toEqual([sid('stale'), sid('active')])
    first.service.unsettleSession(sid('stale'))
    expect(first.service.state.getSnapshot().settledSessionIds).toEqual([sid('active')])
    first.policy.set(settings({ autoSettleInactive: false, autoSettleAfterDays: 3 }))
    expect(first.service.state.getSnapshot().settledSessionIds).toEqual([sid('active')])
    await first.fiber.dispose()

    const restored = await bench([summary('stale', now - 4 * day), summary('active', now - day)])
    expect(restored.service.state.getSnapshot().settledSessionIds).toEqual([sid('active')])
    restored.service.settleSession(sid('stale'))
    expect(restored.service.state.getSnapshot().settledSessionIds).toEqual([sid('stale'), sid('active')])
    await restored.fiber.dispose()
  })

  it('applies settle and snooze precedence through the shared actions', async () => {
    vi.useFakeTimers()
    const now = new Date('2026-08-24T12:00:00.000Z').getTime()
    vi.setSystemTime(now)
    const item = summary('ordered', now)
    const b = await bench([item], { autoSettleInactive: false, autoSettleAfterDays: 3 })

    b.service.snoozeSession(item.id, now + 60_000)
    expect(b.service.state.getSnapshot()).toMatchObject({
      settledSessionIds: [], snoozedUntilBySession: { ordered: now + 60_000 },
    })
    b.service.settleSession(item.id)
    expect(b.service.state.getSnapshot()).toMatchObject({
      settledSessionIds: [item.id], snoozedUntilBySession: {},
    })
    b.service.unsettleSession(item.id)
    expect(b.service.state.getSnapshot().settledSessionIds).toEqual([])
    b.service.snoozeSession(item.id, now + 120_000)
    expect(b.service.state.getSnapshot()).toMatchObject({
      settledSessionIds: [], snoozedUntilBySession: { ordered: now + 120_000 },
    })
    await b.fiber.dispose()
  })

  it('uses shipped policy without settings authority and disposes publication and timers', async () => {
    vi.useFakeTimers()
    const now = new Date('2026-08-24T12:00:00.000Z').getTime()
    vi.setSystemTime(now)
    const day = 86_400_000
    const item = summary('listed', now - 4 * day)
    const b = await bench([item], { autoSettleInactive: false, autoSettleAfterDays: 3 })
    b.policy.set({
      status: 'unavailable', value: undefined, revision: undefined, writable: false, mode: 'memory',
    })
    expect(b.service.state.getSnapshot().settledSessionIds).toEqual([item.id])
    b.service.settleSession(sid('ghost'))
    expect(b.service.state.getSnapshot().settledSessionIds).toEqual([item.id])
    b.sessions.set(sessionState([]))
    expect(b.service.state.getSnapshot()).toEqual({
      settledSessionIds: [], snoozedUntilBySession: {}, wokeSessionIds: [],
    })
    const timerCountBeforeDispose = vi.getTimerCount()
    expect(timerCountBeforeDispose).toBeGreaterThan(0)

    await b.fiber.dispose()
    expect(b.ctx.get('sessionDisposition')).toBeUndefined()
    expect(vi.getTimerCount()).toBeLessThan(timerCountBeforeDispose)
    b.sessions.set(sessionState([item]))
    expect(b.service.state.getSnapshot().settledSessionIds).toEqual([])
  })

  it('publishes deadline and pending-interaction wakes until they are dismissed', async () => {
    vi.useFakeTimers()
    const now = new Date('2026-08-24T12:00:00.000Z').getTime()
    vi.setSystemTime(now)
    const nap = summary('nap', now)
    const blocked = summary('blocked', now)
    const b = await bench([nap, blocked], { autoSettleInactive: false, autoSettleAfterDays: 3 })

    b.service.snoozeSession(nap.id, now + 300_000)
    b.service.snoozeSession(blocked.id, now + 600_000)
    expect(b.service.state.getSnapshot()).toMatchObject({
      snoozedUntilBySession: { nap: now + 300_000, blocked: now + 600_000 },
      wokeSessionIds: [],
    })

    b.sessions.set(sessionState([nap, { ...blocked, pendingInteraction: 'question' }]))
    expect(b.service.state.getSnapshot()).toMatchObject({
      snoozedUntilBySession: { nap: now + 300_000 },
      wokeSessionIds: [blocked.id],
    })

    vi.advanceTimersByTime(300_000)
    expect(b.service.state.getSnapshot()).toMatchObject({ snoozedUntilBySession: {}, wokeSessionIds: [nap.id, blocked.id] })
    b.service.wakeSession(nap.id)
    b.service.wakeSession(blocked.id)
    expect(b.service.state.getSnapshot().wokeSessionIds).toEqual([])
    await b.fiber.dispose()
  })
})
