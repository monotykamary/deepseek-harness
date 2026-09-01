import { describe, expect, it, vi } from 'vitest'
import { CallId } from '@monotykamary/dsh-llm'
import { defineTool, type ToolDefinition, type ToolRunContext } from '../src/index.ts'
import { stableJsonHash } from '../src/speculation/key.ts'
import { PartialCodeFieldExtractor } from '../src/speculation/partial-code.ts'
import { LiteralToolCallScanner } from '../src/speculation/scanner.ts'
import { ToolSpeculationStore } from '../src/speculation/store.ts'
import { RunCodeSpeculationObserver } from '../src/speculation/stream.ts'
import type { ToolSpeculationConfig, ToolSpeculationResult } from '../src/speculation/types.ts'

const config: ToolSpeculationConfig = {
  enabled: true,
  maxConcurrent: 4,
  maxEntries: 8,
  maxBufferBytes: 1_000_000,
  maxRetainedBytes: 1_000_000,
  entryTtlMs: 60_000,
}

const ROOT_OWNER = Symbol('root-owner')
const OTHER_OWNER = Symbol('other-owner')

function definition(name = 'probe'): ToolDefinition {
  return { name } as ToolDefinition
}

function execution(signal = new AbortController().signal): ToolRunContext {
  return { signal } as ToolRunContext
}

function deferred<T>(): PromiseWithResolvers<T> {
  return Promise.withResolvers<T>()
}

describe('partial run_code JSON extraction', () => {
  it('extracts and decodes a code field across arbitrary escaped chunks', () => {
    const extractor = new PartialCodeFieldExtractor(1_000_000)
    for (const chunk of [
      '{"cod',
      'e":"const x = tools.read({ p',
      'ath: \\"src/',
      'a.ts\\" });\\n",',
      '"display":"Inspect"}',
    ]) extractor.push(chunk)

    expect(extractor.code).toBe('const x = tools.read({ path: "src/a.ts" });\n')
    expect(extractor.complete).toBe(true)
    expect(extractor.rejected).toBe(false)
  })

  it('decodes split unicode escapes and ignores fields after code', () => {
    const extractor = new PartialCodeFieldExtractor(1_000_000)
    for (const chunk of ['{"code":"a\\u0', '041b\\', 'u0042","display":"tools.fake({})"}']) {
      extractor.push(chunk)
    }
    expect(extractor.code).toBe('aAbB')
    expect(extractor.complete).toBe(true)
  })

  it('does not mistake escaped code text in an earlier string for the field', () => {
    const extractor = new PartialCodeFieldExtractor(1_000_000)
    extractor.push(JSON.stringify({ display: '{"code":"decoy"}', code: 'real();' }))
    expect(extractor.code).toBe('real();')
  })

  it('ignores nested code properties and selects only the top-level field', () => {
    const extractor = new PartialCodeFieldExtractor(1_000_000)
    extractor.push(JSON.stringify({ nested: { code: 'tools.secret({})' }, code: 'tools.read({ path: "safe" })' }))
    expect(extractor.code).toBe('tools.read({ path: "safe" })')
  })

  it('rejects a malformed completed value before the code field', () => {
    const extractor = new PartialCodeFieldExtractor(1_000_000)
    extractor.push('{"metadata":{notJson},"code":"tools.read({})"}')
    expect(extractor.rejected).toBe(true)
    expect(extractor.code).toBeUndefined()
  })

  it('fails closed after a multibyte cap overflow or malformed control character', () => {
    const capped = new PartialCodeFieldExtractor(24)
    capped.push('{"code":"tools.x(')
    capped.push('🙂🙂🙂🙂)"}')
    expect(capped.rejected).toBe(true)
    expect(capped.code).toBeUndefined()
    capped.push('{"code":"resurrect()"}')
    expect(capped.code).toBeUndefined()

    const malformed = new PartialCodeFieldExtractor(1_000_000)
    malformed.push('{"code":"a\nb"}')
    expect(malformed.rejected).toBe(true)
    expect(malformed.code).toBeUndefined()
  })
})

describe('literal Code Mode call scanning', () => {
  it('detects property and string-element calls with nested JSON literals', () => {
    const scanner = new LiteralToolCallScanner()
    expect(scanner.push(`
      const a = await tools.read({ path: "src/index.ts" });
      const b = await tools["grep"]({
        pattern: "TODO", path: "src", flags: [true, 3, null], offset: -2,
      });
    `)).toEqual([
      { name: 'read', arguments: { path: 'src/index.ts' } },
      {
        name: 'grep',
        arguments: { pattern: 'TODO', path: 'src', flags: [true, 3, null], offset: -2 },
      },
    ])
  })

  it('finds zero-argument and Promise.all calls but emits one key once', () => {
    const scanner = new LiteralToolCallScanner()
    expect(scanner.push(`
      await Promise.all([
        tools.status(),
        tools.read({ path: "a.ts" }),
        tools.read({ path: "b.ts" }),
      ]);
    `)).toEqual([
      { name: 'status', arguments: {} },
      { name: 'read', arguments: { path: 'a.ts' } },
      { name: 'read', arguments: { path: 'b.ts' } },
    ])
    expect(scanner.push('tools.status(); tools.read({ path: "a.ts" });')).toEqual([])
  })

  it('skips non-literal, positional, spread, template-expression, and computed-name calls', () => {
    const scanner = new LiteralToolCallScanner()
    expect(scanner.push([
      'tools.read({ path: someVar })',
      'tools.read({ path: `prefix-${name}` })',
      'tools.read({ ...base })',
      'tools.read("a.ts")',
      'tools.read({ path: "a" }, { extra: true })',
      'tools[toolName]({ path: "a.ts" })',
    ].join(';\n') + ';')).toEqual([])
  })

  it('taints only the SDK root when the program binds tools', () => {
    const scanner = new LiteralToolCallScanner()
    expect(scanner.push(`
      const tools = { read: () => "fake" };
      tools.read({ path: "a.ts" });
    `)).toEqual([])

    const parameterScanner = new LiteralToolCallScanner()
    expect(parameterScanner.push('const run = (tools) => tools.read({ path: "a.ts" });')).toEqual([])
  })

  it('reparses only after a possible call completion and handles conditional calls', () => {
    const scanner = new LiteralToolCallScanner()
    expect(scanner.push('if (ready) tools.read({ path: "a.ts"')).toEqual([])
    expect(scanner.push('if (ready) tools.read({ path: "a.ts" });')).toEqual([
      { name: 'read', arguments: { path: 'a.ts' } },
    ])
  })

  it('hashes equivalent JSON objects independent of insertion order', () => {
    expect(stableJsonHash({ b: [2, 1], a: { y: true, x: null } }))
      .toBe(stableJsonHash({ a: { x: null, y: true }, b: [2, 1] }))
  })
})

describe('run_code speculation stream observer', () => {
  it('catches up a completed stream after the TypeScript scanner loads', async () => {
    const scanner = deferred<{ new(): LiteralToolCallScanner }>()
    const launch = vi.fn()
    const cancel = vi.fn()
    const observer = new RunCodeSpeculationObserver(
      1_000_000,
      launch,
      () => scanner.promise,
      cancel,
    )

    const finalArguments = JSON.stringify({ code: 'return tools.read({ path: "a.ts" })', display: 'Read' })
    observer.push(finalArguments)
    expect(launch).not.toHaveBeenCalled()

    scanner.resolve(LiteralToolCallScanner)
    await vi.waitFor(() => {
      expect(launch).toHaveBeenCalledWith({ name: 'read', arguments: { path: 'a.ts' } })
    })
    observer.finish(finalArguments)
    expect(cancel).not.toHaveBeenCalled()
  })

  it('cancels already launched work when later stream bytes are invalid', async () => {
    const launch = vi.fn()
    const cancel = vi.fn()
    const observer = new RunCodeSpeculationObserver(
      1_000_000,
      launch,
      () => Promise.resolve(LiteralToolCallScanner),
      cancel,
    )
    await Promise.resolve()

    observer.push('{"code":"tools.read({ path: \\"a.ts\\" })')
    await vi.waitFor(() => { expect(launch).toHaveBeenCalledOnce() })
    observer.push('\n')

    expect(cancel).toHaveBeenCalledOnce()
    observer.push('more')
    expect(launch).toHaveBeenCalledOnce()
  })

  it('cancels launched work when final arguments duplicate or change the streamed code', async () => {
    const launch = vi.fn()
    const cancel = vi.fn()
    const observer = new RunCodeSpeculationObserver(
      1_000_000,
      launch,
      () => Promise.resolve(LiteralToolCallScanner),
      cancel,
    )
    await Promise.resolve()
    const duplicate = '{"code":"tools.read({ path: \\"a\\" })","code":"tools.read({ path: \\"b\\" })"}'
    observer.push(duplicate)
    await vi.waitFor(() => { expect(launch).toHaveBeenCalledOnce() })
    observer.finish(duplicate)
    expect(cancel).toHaveBeenCalledOnce()
  })

  it('owns scanner-loader failures and cancels the root', async () => {
    const cancel = vi.fn()
    new RunCodeSpeculationObserver(
      1_000_000,
      vi.fn(),
      () => Promise.reject(new Error('scanner unavailable')),
      cancel,
    )
    await vi.waitFor(() => { expect(cancel).toHaveBeenCalledOnce() })
  })
})

describe('speculative tool eligibility', () => {
  const candidate = {
    name: 'unsafe',
    description: 'Unsafe hidden call.',
    parameters: {},
    output: { schema: { type: 'string' as const }, render: () => [] },
    execute: () => Promise.resolve('natural'),
    speculate: async () => ({ value: 'hidden' }),
  }

  it('requires explicit read risk and no effects', () => {
    expect(() => defineTool(candidate)).toThrow(/risk "read"/)
    expect(() => defineTool({ ...candidate, risk: 'write', effectKind: 'none' })).toThrow(/risk "read"/)
    expect(() => defineTool({ ...candidate, risk: 'read', effectKind: 'workspace' })).toThrow(/effectKind "none"/)
    expect(() => defineTool({ ...candidate, risk: 'read', effectKind: 'none' })).not.toThrow()
  })
})

describe('ToolSpeculationStore', () => {
  it('serves one matching result once and replays deferred effects', async () => {
    const store = new ToolSpeculationStore(config)
    const tool = definition()
    const replay = vi.fn()
    expect(store.launch({ owner: ROOT_OWNER, validate: result => result,
      rootCallId: CallId('root-1'),
      name: tool.name,
      arguments: { value: 'x' },
      definition: tool,
      execute: async () => ({ value: 'prefetched', replay }),
    })).toBe(true)

    expect(await store.tryServe(ROOT_OWNER, tool.name, { value: 'x' }, tool, execution()))
      .toEqual({ hit: true, value: 'prefetched' })
    expect(replay).toHaveBeenCalledOnce()
    expect(await store.tryServe(ROOT_OWNER, tool.name, { value: 'x' }, tool, execution()))
      .toEqual({ hit: false, reason: 'absent' })
    expect(store.stats()).toMatchObject({ launched: 1, served: 1, pending: 0 })
  })

  it('invalidates when the epoch advances before or during a serve', async () => {
    const tool = definition()
    const before = new ToolSpeculationStore(config)
    before.launch({ owner: ROOT_OWNER, validate: result => result,
      rootCallId: CallId('before'), name: tool.name, arguments: {}, definition: tool,
      execute: async () => ({ value: 'stale' }),
    })
    before.bumpEpoch(ROOT_OWNER)
    expect(await before.tryServe(ROOT_OWNER, tool.name, {}, tool, execution()))
      .toEqual({ hit: false, reason: 'epoch' })

    const during = new ToolSpeculationStore(config)
    const pending = deferred<ToolSpeculationResult>()
    during.launch({ owner: ROOT_OWNER, validate: result => result,
      rootCallId: CallId('during'), name: tool.name, arguments: {}, definition: tool,
      execute: () => pending.promise,
    })
    const serving = during.tryServe(ROOT_OWNER, tool.name, {}, tool, execution())
    during.bumpEpoch(ROOT_OWNER)
    pending.resolve({ value: 'late-stale' })
    expect(await serving).toEqual({ hit: false, reason: 'epoch' })
    expect(during.stats().epochInvalidated).toBe(1)
  })

  it('invalidates stale, failed, replay-failed, and changed-definition entries', async () => {
    const tool = definition()

    const stale = new ToolSpeculationStore(config)
    stale.launch({ owner: ROOT_OWNER, validate: result => result,
      rootCallId: CallId('stale'), name: tool.name, arguments: {}, definition: tool,
      execute: async () => ({ value: 'old', isFresh: () => false }),
    })
    expect(await stale.tryServe(ROOT_OWNER, tool.name, {}, tool, execution()))
      .toEqual({ hit: false, reason: 'freshness' })

    const failed = new ToolSpeculationStore(config)
    failed.launch({ owner: ROOT_OWNER, validate: result => result,
      rootCallId: CallId('failed'), name: tool.name, arguments: {}, definition: tool,
      execute: () => Promise.reject(new Error('hidden failure')),
    })
    expect(await failed.tryServe(ROOT_OWNER, tool.name, {}, tool, execution()))
      .toEqual({ hit: false, reason: 'failed' })

    const replayFailed = new ToolSpeculationStore(config)
    replayFailed.launch({ owner: ROOT_OWNER, validate: result => result,
      rootCallId: CallId('replay'), name: tool.name, arguments: {}, definition: tool,
      execute: async () => ({ value: 'x', replay: () => { throw new Error('replay failure') } }),
    })
    expect(await replayFailed.tryServe(ROOT_OWNER, tool.name, {}, tool, execution()))
      .toEqual({ hit: false, reason: 'failed' })

    const changed = new ToolSpeculationStore(config)
    changed.launch({ owner: ROOT_OWNER, validate: result => result,
      rootCallId: CallId('changed'), name: tool.name, arguments: {}, definition: tool,
      execute: async () => ({ value: 'x' }),
    })
    expect(await changed.tryServe(ROOT_OWNER, tool.name, {}, definition(), execution()))
      .toEqual({ hit: false, reason: 'definition' })
  })

  it('scopes entries to owners and enforces entry, duplicate, and concurrency caps', async () => {
    const tool = definition()
    const oneEntry = new ToolSpeculationStore({ ...config, maxEntries: 1 })
    const input = {
      owner: ROOT_OWNER, validate: (result: ToolSpeculationResult) => result,
      rootCallId: CallId('root'), name: tool.name, arguments: { id: 1 }, definition: tool,
      execute: async (): Promise<ToolSpeculationResult> => ({ value: 1 }),
    }
    expect(oneEntry.launch(input)).toBe(true)
    expect(oneEntry.launch(input)).toBe(false)
    expect(oneEntry.launch({ ...input, arguments: { id: 2 } })).toBe(false)
    expect(await oneEntry.tryServe(OTHER_OWNER, tool.name, { id: 1 }, tool, execution()))
      .toEqual({ hit: false, reason: 'absent' })
    expect(oneEntry.stats().skipped).toBe(2)

    const oneFlight = new ToolSpeculationStore({ ...config, maxConcurrent: 1 })
    const pending = deferred<ToolSpeculationResult>()
    expect(oneFlight.launch({ ...input, execute: () => pending.promise })).toBe(true)
    expect(oneFlight.launch({ ...input, arguments: { id: 2 } })).toBe(false)
    pending.resolve({ value: 1 })
    await pending.promise
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(oneFlight.launch({ ...input, arguments: { id: 2 } })).toBe(true)
  })

  it('isolates identical provider call IDs and signatures by unforgeable owner', async () => {
    const tool = definition()
    const store = new ToolSpeculationStore(config)
    const input = {
      rootCallId: CallId('shared'), name: tool.name, arguments: { id: 1 }, definition: tool,
      validate: (result: ToolSpeculationResult) => result,
    }
    expect(store.launch({ ...input, owner: ROOT_OWNER, execute: async () => ({ value: 'root' }) })).toBe(true)
    expect(store.launch({ ...input, owner: OTHER_OWNER, execute: async () => ({ value: 'other' }) })).toBe(true)
    expect(await store.tryServe(OTHER_OWNER, tool.name, { id: 1 }, tool, execution()))
      .toEqual({ hit: true, value: 'other' })
    expect(await store.tryServe(ROOT_OWNER, tool.name, { id: 1 }, tool, execution()))
      .toEqual({ hit: true, value: 'root' })
  })

  it('keeps aborted work in concurrency accounting until it actually settles', async () => {
    const tool = definition()
    const store = new ToolSpeculationStore({ ...config, maxConcurrent: 1 })
    const pending = deferred<ToolSpeculationResult>()
    const first = {
      owner: ROOT_OWNER, validate: (result: ToolSpeculationResult) => result,
      rootCallId: CallId('first'), name: tool.name, arguments: {}, definition: tool,
      execute: () => pending.promise,
    }
    expect(store.launch(first)).toBe(true)
    store.cancelRoot(ROOT_OWNER)
    expect(store.stats()).toMatchObject({ pending: 0, inFlight: 1 })
    expect(store.launch({ ...first, owner: OTHER_OWNER, rootCallId: CallId('second') })).toBe(false)
    pending.resolve({ value: 'done' })
    await pending.promise
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(store.launch({ ...first, owner: OTHER_OWNER, rootCallId: CallId('second') })).toBe(true)
  })

  it('rejects values that exceed the total retained-byte budget', async () => {
    const tool = definition()
    const store = new ToolSpeculationStore({ ...config, maxRetainedBytes: 4 })
    store.launch({
      owner: ROOT_OWNER, validate: result => result,
      rootCallId: CallId('large'), name: tool.name, arguments: {}, definition: tool,
      execute: async () => ({ value: 'larger than four bytes' }),
    })
    expect(await store.tryServe(ROOT_OWNER, tool.name, {}, tool, execution()))
      .toEqual({ hit: false, reason: 'failed' })
    expect(store.stats()).toMatchObject({ retainedBytes: 0, failed: 1 })
  })

  it('aborts running work at its TTL without a later lookup', async () => {
    vi.useFakeTimers()
    try {
      const tool = definition()
      const store = new ToolSpeculationStore({ ...config, entryTtlMs: 1_000 })
      const aborted = deferred<undefined>()
      store.launch({
        owner: ROOT_OWNER, validate: result => result,
        rootCallId: CallId('timed'), name: tool.name, arguments: {}, definition: tool,
        execute: signal => new Promise<ToolSpeculationResult>((resolve) => {
          signal.addEventListener('abort', () => {
            aborted.resolve(undefined)
            resolve({ value: 'too late' })
          }, { once: true })
        }),
      })
      await vi.advanceTimersByTimeAsync(1_000)
      await aborted.promise
      expect(store.stats()).toMatchObject({ wasted: 1, pending: 0 })
    } finally {
      vi.useRealTimers()
    }
  })

  it('expires entries and aborts unserved work when its root ends', async () => {
    vi.useFakeTimers()
    try {
      const tool = definition()
      const store = new ToolSpeculationStore({ ...config, entryTtlMs: 1_000 })
      store.launch({ owner: ROOT_OWNER, validate: result => result,
        rootCallId: CallId('expired'), name: tool.name, arguments: {}, definition: tool,
        execute: async () => ({ value: 'old' }),
      })
      vi.advanceTimersByTime(2_000)
      expect(await store.tryServe(ROOT_OWNER, tool.name, {}, tool, execution()))
        .toEqual({ hit: false, reason: 'absent' })
      expect(store.stats()).toMatchObject({ wasted: 1, pending: 0 })
    } finally {
      vi.useRealTimers()
    }

    const tool = definition()
    const store = new ToolSpeculationStore(config)
    const aborted = deferred<undefined>()
    store.launch({ owner: ROOT_OWNER, validate: result => result,
      rootCallId: CallId('cancelled'), name: tool.name, arguments: {}, definition: tool,
      execute: signal => new Promise<ToolSpeculationResult>((resolve) => {
        signal.addEventListener('abort', () => {
          aborted.resolve(undefined)
          resolve({ value: 'discarded' })
        }, { once: true })
      }),
    })
    await Promise.resolve()
    store.cancelRoot(ROOT_OWNER)
    await aborted.promise
    expect(store.stats()).toMatchObject({ wasted: 1, pending: 0 })
  })

  it('does not replay after the natural call is aborted while waiting', async () => {
    const tool = definition()
    const store = new ToolSpeculationStore(config)
    const replay = vi.fn()
    store.launch({ owner: ROOT_OWNER, validate: result => result,
      rootCallId: CallId('aborted'), name: tool.name, arguments: {}, definition: tool,
      execute: async (signal) => {
        if (!signal.aborted) {
          await new Promise<undefined>((resolve) => {
            signal.addEventListener('abort', () => { resolve(undefined) }, { once: true })
          })
        }
        return { value: 'late', replay }
      },
    })
    await Promise.resolve()
    const controller = new AbortController()
    const serving = store.tryServe(ROOT_OWNER, tool.name, {}, tool, execution(controller.signal))
    controller.abort('stop')

    expect(await serving).toEqual({ hit: false, reason: 'failed' })
    expect(replay).not.toHaveBeenCalled()
  })
})
