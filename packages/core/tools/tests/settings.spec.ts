/** Persistent settings coverage for speculative Code Mode execution. */

import { describe, expect, it, vi } from 'vitest'
import { Context, Service } from '@monotykamary/cordis'
import { CallId } from '@monotykamary/dsh-llm'
import SystemPrompt from '@monotykamary/dsh-system-prompt'
import { SettingsProvider, type SettingsNamespace } from '@monotykamary/dsh-settings'
import ToolRuntime, {
  TOOL_RUNTIME_SCHEDULER,
  TOOL_SPECULATION_SETTINGS_NAMESPACE,
  defineTool,
  type ToolSpeculationObserver,
} from '@monotykamary/dsh-tools'

class MemorySettings extends SettingsProvider {
  readonly writable = true
  private doc: Record<string, unknown>

  constructor(ctx: Context, config: { doc?: Record<string, unknown> } = {}) {
    super(ctx)
    this.doc = structuredClone(config.doc ?? {})
  }

  protected load(): Promise<Record<string, unknown>> {
    return Promise.resolve(structuredClone(this.doc))
  }

  protected persist(ns: SettingsNamespace, section: Record<string, unknown>): Promise<void> {
    this.doc = { ...this.doc, [ns]: structuredClone(section) }
    return Promise.resolve()
  }
}

class TypeScriptCodeRuntimeDescriptor extends Service {
  readonly language = 'typescript'

  constructor(ctx: Context) {
    super(ctx, 'codeRuntime')
  }
}

async function setup(user: Record<string, unknown> = {}) {
  const ctx = new Context()
  await ctx.plugin(MemorySettings, { doc: { [TOOL_SPECULATION_SETTINGS_NAMESPACE]: user } })
  await ctx.plugin(SystemPrompt)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the scanner gate needs only the language descriptor
  await ctx.plugin(TypeScriptCodeRuntimeDescriptor as any)
  await ctx.plugin(ToolRuntime, {
    mode: 'code',
    speculation: { enabled: true, maxEntries: 8 },
  })
  ctx.tools.register(defineTool({
    name: 'probe',
    risk: 'read',
    effectKind: 'none',
    description: 'Read a probe.',
    parameters: { id: { type: 'integer', required: true } },
    output: { schema: { type: 'integer' }, render: (_args, value) => [{ type: 'text', text: String(value) }] },
    execute: args => Promise.resolve(args.id),
    speculate: async args => ({ value: args.id }),
  }))
  return ctx
}

describe('tool speculation settings', () => {
  it('layers a stored user switch over the composition entry', async () => {
    const ctx = await setup({ enabled: false })
    const descriptor = ctx.settings.describe().find(item => item.ns === TOOL_SPECULATION_SETTINGS_NAMESPACE)

    expect(descriptor).toMatchObject({
      ns: TOOL_SPECULATION_SETTINGS_NAMESPACE,
      applies: 'live',
      base: { enabled: true, maxEntries: 8 },
      user: { enabled: false },
      value: { enabled: false, maxEntries: 8 },
    })
    expect(ctx.tools[TOOL_RUNTIME_SCHEDULER].observeRunCode({ rootCallId: CallId('disabled') }))
      .toBeUndefined()
  })

  it('applies validated limits live and cancels retained work when disabled', async () => {
    const ctx = await setup()
    await ctx.settings.update(TOOL_SPECULATION_SETTINGS_NAMESPACE, { maxEntries: 1 })
    await expect(ctx.settings.update(TOOL_SPECULATION_SETTINGS_NAMESPACE, { maxEntries: 0 }))
      .rejects.toThrow()

    let observer: ToolSpeculationObserver | undefined
    await vi.waitFor(() => {
      observer = ctx.tools[TOOL_RUNTIME_SCHEDULER].observeRunCode({ rootCallId: CallId('limited') })
      expect(observer).toBeDefined()
    })
    const finalArguments = JSON.stringify({
      code: 'return [tools.probe({ id: 1 }), tools.probe({ id: 2 })]',
      display: 'Probe twice',
    })
    observer!.push(finalArguments)
    observer!.finish(finalArguments)
    await vi.waitFor(() => {
      expect(ctx.tools[TOOL_RUNTIME_SCHEDULER].speculationStats()).toMatchObject({
        launched: 1,
        skipped: 1,
        pending: 1,
      })
    })

    await ctx.settings.update(TOOL_SPECULATION_SETTINGS_NAMESPACE, { enabled: false })
    await vi.waitFor(() => {
      expect(ctx.tools[TOOL_RUNTIME_SCHEDULER].speculationStats().pending).toBe(0)
      expect(ctx.tools[TOOL_RUNTIME_SCHEDULER].observeRunCode({ rootCallId: CallId('disabled-live') }))
        .toBeUndefined()
    })
  })
})
