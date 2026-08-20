/** Settings opt-in for the first-prompt LLM title provider. */

import { Context } from '@monotykamary/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import LlmRuntime, { createUserMessage, LlmAdapter } from '@monotykamary/dsh-llm'
import type { GenerateOptions, StreamChunk } from '@monotykamary/dsh-llm'
import SessionStore, { Session, SessionId } from '@monotykamary/dsh-session'
import SessionTitleService from '@monotykamary/dsh-session-title'
import { SettingsProvider, settingsNamespace } from '@monotykamary/dsh-settings'
import type { SettingsNamespace } from '@monotykamary/dsh-settings'
import { SESSION_TITLE_LLM_SETTINGS_NAMESPACE } from '@monotykamary/dsh-session-title-llm'
import * as providerPlugin from '@monotykamary/dsh-session-title-first-prompt-llm'

/** The smallest real provider: one in-memory document, always writable. */
class MemorySettings extends SettingsProvider {
  doc: Record<string, unknown> = {}

  get writable(): boolean {
    return true
  }

  protected load(): Promise<Record<string, unknown>> {
    return Promise.resolve(structuredClone(this.doc))
  }

  protected persist(ns: SettingsNamespace, section: Record<string, unknown>): Promise<void> {
    this.doc = { ...this.doc, [ns]: structuredClone(section) }
    return Promise.resolve()
  }
}

class RecordingAdapter extends LlmAdapter {
  readonly requests: GenerateOptions[] = []

  override async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.requests.push(options)
    yield { type: 'text-delta', index: 0, text: 'Settings-driven title' }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

const TITLE_CONFIG = { fallbackMaxWords: 5, fallbackMaxBytes: 40, maxTitleBytes: 80 } as const
const LLM_CONFIG = {
  enabled: false,
  targetWords: 5,
  targetCjkCharacters: 10,
  maxInputBytes: 1_000,
  maxOutputTokens: 32,
  timeoutMs: 1_000,
} as const

const contexts: Context[] = []

afterEach(async () => {
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
})

async function settle(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 0))
}

async function boot(): Promise<{
  ctx: Context
  adapter: RecordingAdapter
  settings: SettingsProvider
}> {
  const ctx = new Context()
  contexts.push(ctx)
  const settingsFiber = ctx.plugin(MemorySettings)
  await settingsFiber.await()
  await ctx.plugin(LlmRuntime)
  await ctx.plugin(SessionStore)
  await ctx.plugin(SessionTitleService, TITLE_CONFIG)
  const adapter = new RecordingAdapter()
  ctx.llm.registerAdapter(['main-route'], adapter)
  await ctx.plugin(providerPlugin, LLM_CONFIG)
  return { ctx, adapter, settings: settingsFiber.ctx.settings }
}

/** One eligible first prompt plus the main-request route that starts automatic work. */
function promptAndRoute(ctx: Context): Session {
  const session = ctx.sessions.create(SessionId(`settings-title-${ctx.sessions.list().length}`))
  session.append('turn/start', { turn: 1 })
  session.append('user/message', createUserMessage({
    content: [{ type: 'text', text: 'first input' }], source: { kind: 'user' },
  }), { surfaceOp: 'append' })
  session.append('request/header', {
    header: { config: { provider: 'main-route', model: 'main-model' } }, reason: 'initial',
  })
  return session
}

describe('first-prompt title provider settings opt-in', () => {
  it('keeps the provider off by default while the fallback still titles sessions', async () => {
    const { ctx, adapter, settings } = await boot()
    expect(settings.get(settingsNamespace('session-title-llm'))).toMatchObject({ enabled: false })

    const session = promptAndRoute(ctx)
    await settle()

    expect(adapter.requests).toHaveLength(0)
    expect(ctx.sessionTitle.get(session)?.source.kind).toBe('fallback')
  })

  it('mounts the provider on a live settings update and unmounts on the next one', async () => {
    const { ctx, adapter, settings } = await boot()

    await settings.update(SESSION_TITLE_LLM_SETTINGS_NAMESPACE, { enabled: true })
    await settle()
    const first = promptAndRoute(ctx)
    await settle()

    expect(adapter.requests).toHaveLength(1)
    expect(ctx.sessionTitle.get(first)).toMatchObject({
      source: { kind: 'provider', provider: 'session-title-first-prompt-llm' },
    })

    await settings.update(SESSION_TITLE_LLM_SETTINGS_NAMESPACE, { enabled: false })
    await settle()
    const second = promptAndRoute(ctx)
    await settle()

    expect(adapter.requests).toHaveLength(1)
    expect(ctx.sessionTitle.get(second)?.source.kind).toBe('fallback')
  })

  it('re-registers only after a pending disposal settles', async () => {
    const ctx = new Context()
    contexts.push(ctx)
    const settingsFiber = ctx.plugin(MemorySettings)
    await settingsFiber.await()
    await ctx.plugin(LlmRuntime)
    await ctx.plugin(SessionStore)
    await ctx.plugin(SessionTitleService, TITLE_CONFIG)
    const settings = settingsFiber.ctx.settings
    let pendingDispose: (() => void) | undefined
    let registerCalls = 0
    vi.spyOn(ctx.sessionTitle, 'register').mockImplementation(() => {
      registerCalls += 1
      return () => new Promise<void>((resolve) => { pendingDispose = resolve })
    })
    await ctx.plugin(providerPlugin, LLM_CONFIG)

    await settings.update(SESSION_TITLE_LLM_SETTINGS_NAMESPACE, { enabled: true })
    await settle()
    expect(registerCalls).toBe(1)

    await settings.update(SESSION_TITLE_LLM_SETTINGS_NAMESPACE, { enabled: false })
    await settle()
    expect(pendingDispose).toBeDefined()
    expect(registerCalls).toBe(1)

    // A re-enable inside the disposal window must wait for the old
    // registration to release before mounting again.
    await settings.update(SESSION_TITLE_LLM_SETTINGS_NAMESPACE, { enabled: true })
    await settle()
    expect(registerCalls).toBe(1)
    pendingDispose!()
    await settle()
    expect(registerCalls).toBe(2)
  })
})
