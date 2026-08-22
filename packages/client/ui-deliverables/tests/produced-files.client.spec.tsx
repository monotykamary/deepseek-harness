// @vitest-environment jsdom
/**
 * ui-deliverables browser half: the derivation contract of
 * `producedForClosing` over engine-published Turn data, the row's rendering
 * and opener wiring, and the plugin registrations' fiber-teardown removal
 * (HMR safety) against the real SlotRegistry.
 */
import { Context } from '@monotykamary/cordis'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ConversationEventRegistry, ConversationNodeAssembler, ConversationViewRegistry, SlotRegistry,
} from '@monotykamary/dsh-client-runtime/client'
import type {
  ConversationEventInput, ConversationLocationDataStore, ConversationMatch, ConversationNodeDefinition,
  ConversationTimelineSnapshot, ConversationTurnDataMap, ConversationViewDefinition,
  ConversationViewNode, ToolResultNode, TurnLocation,
} from '@monotykamary/dsh-client-runtime/client'
import { apply as applyLocale, inject as localeInject } from '@monotykamary/dsh-client-locale/client'
import type { ChatFileMentions, TurnTailOwnerProps } from '@monotykamary/dsh-client-ui-conversation/client'
import { resolveSlotLabel } from '@monotykamary/dsh-client-ui-slots'
import { makeTranslate, stubSettingsScope } from '@monotykamary/dsh-client-test-runtime'
import { ProducedFiles, type ProducedFilesInjected } from '../src/client/ProducedFiles.tsx'
import {
  basename, deliverablesDefinition, producedFileMentions, producedForClosing, selectProducedFiles,
  type DeliverablesTurnData,
} from '../src/client/turn-deliverables.ts'
import { apply, inject } from '../src/client/index.ts'
import { deliverablesViewDefinition } from '../src/client/deliverables-view.ts'
import type { DeliverablesSnapshot } from '../src/client/contract.ts'
import { apply as applyInvariant } from '../src/invariant.ts'
import { en, zh } from '../src/client/locales.ts'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

class TestTurnDataStore implements ConversationLocationDataStore<ConversationTurnDataMap> {
  private readonly values = new Map<string, unknown>()

  get<Key extends Extract<keyof ConversationTurnDataMap, string>>(
    key: Key,
  ): Readonly<ConversationTurnDataMap[Key]> | undefined {
    return this.values.get(key) as Readonly<ConversationTurnDataMap[Key]> | undefined
  }

  set<Key extends Extract<keyof ConversationTurnDataMap, string>>(
    key: Key,
    value: ConversationTurnDataMap[Key],
  ): void {
    this.values.set(key, value)
  }
}

const turnLocation = (turn: number, deliverables?: DeliverablesTurnData): TurnLocation => {
  const data = new TestTurnDataStore()
  if (deliverables !== undefined) data.set('deliverables', deliverables)
  return { turn, start: undefined, end: undefined, status: 'closed', steps: [], data }
}

const produced = (...values: ReadonlyArray<readonly [seq: number, path: string]>): DeliverablesTurnData => ({
  produced: values.map(([seq, path]) => ({ seq, path })),
  changes: [],
})

function tailOwner(
  data: DeliverablesTurnData | undefined,
  seq: number,
  openFile: (path: string) => void = () => {},
  turn = 1,
): TurnTailOwnerProps {
  return { seq, openFile, turn: turnLocation(turn, data) }
}

interface TimelineSnapshot {
  readonly timeline: ConversationTimelineSnapshot
}

class TestEventDefinitions {
  entries(): readonly ConversationNodeDefinition[] { return [deliverablesDefinition] }
  fallbackEntry(): ConversationNodeDefinition | undefined { return undefined }
}

class TestViewDefinitions {
  entries(): readonly ConversationViewDefinition[] { return [timelineViewDefinition, deliverablesViewDefinition] }
}

const timelineViewDefinition: ConversationViewDefinition<ConversationViewNode, TimelineSnapshot> = {
  target: 'test',
  create: () => {
    let current: TimelineSnapshot = { timeline: { turnOrder: [], turns: new Map() } }
    return {
      empty: current,
      replace: ({ timeline }) => (current = { timeline }),
      apply: ({ timeline }) => (current = { timeline }),
    }
  },
}

function at(
  seq: number,
  type: string,
  data: unknown,
  view?: ConversationEventInput['view'],
): ConversationEventInput {
  return {
    event: {
      seq, time: seq * 1_000, type, data,
      ...(type === 'tool/result' ? { surfaceOp: 'append' } : {}),
    } as ConversationEventInput['event'],
    view,
  }
}

function matched(input: ConversationEventInput, role: ConversationMatch['role']): ConversationMatch {
  return { ...input, role, location: { kind: 'unresolved' } }
}

function call(
  seq: number,
  callId: string,
  view: ToolResultNode['callView'],
  turn = 1,
): ConversationEventInput {
  return at(
    seq,
    'tool/call',
    { turn, step: 1, callId, name: 'fixture', arguments: '{}' },
    { for: 'call', view: view ?? { card: 'generic', title: 'fixture' } },
  )
}

function result(
  seq: number, callId: string, isError = false, turn = 1,
  view?: Exclude<ToolResultNode['resultView'], null>, mutations?: unknown,
): ConversationEventInput {
  return at(seq, 'tool/result', {
    turn,
    step: 1,
    message: {
      source: { type: 'tool-result', callId },
      content: [{ type: 'tool-result', content: [], isError }],
    },
    ...(mutations === undefined ? {} : { mutations }),
  }, view === undefined ? undefined : { for: 'result', view })
}

function mutations(...paths: string[]): unknown[] {
  return paths.map(path => ({
    path,
    operation: 'modify',
    diffs: [{ oldText: 'before', newText: 'after' }],
  }))
}

function diff(...paths: string[]): ToolResultNode['callView'] {
  return {
    card: 'diff', title: `Write ${paths[0] ?? ''}`,
    diffs: paths.map(path => ({ path, oldText: null, newText: 'x' })),
    locations: paths.map(path => ({ path })),
  }
}

function edit(path: string): ToolResultNode['callView'] {
  return { card: 'generic', title: `insert ${path}`, kind: 'edit', locations: [{ path }] }
}

function assembler(entries: readonly ConversationEventInput[], hasMore = false): ConversationNodeAssembler {
  const value = new ConversationNodeAssembler(new TestEventDefinitions(), new TestViewDefinitions())
  value.replaceWindow(entries, hasMore)
  value.flush()
  return value
}

function deliverablesOf(value: ConversationNodeAssembler, turn = 1): Readonly<DeliverablesTurnData> | undefined {
  const snapshot = value.snapshot('test') as TimelineSnapshot
  return snapshot.timeline.turns.get(turn)?.data.get('deliverables')
}

function changesOf(value: ConversationNodeAssembler): DeliverablesSnapshot {
  return value.snapshot('deliverables') as DeliverablesSnapshot
}

describe('produced-file Turn data', () => {
  it('deduplicates paths in first-seen order and stops at the closing Assistant seq', () => {
    const data = produced(
      [3, 'out/index.html'],
      [4, 'out/app.css'],
      [4, 'out/index.html'],
      [8, 'after.txt'],
    )
    expect(producedForClosing(data, 6)).toEqual(['out/index.html', 'out/app.css'])
    expect(selectProducedFiles(tailOwner(data, 6))).toEqual({
      paths: ['out/index.html', 'out/app.css'], changes: [],
    })
    const changed: DeliverablesTurnData = {
      ...data,
      changes: [{
        seq: 4, turn: 1, callId: 'write', title: 'Write',
        diffs: [{ path: 'out/index.html', oldText: null, newText: 'x' }],
      }, {
        seq: 8, turn: 1, callId: 'later', title: 'Later',
        diffs: [{ path: 'after.txt', oldText: null, newText: 'y' }],
      }],
    }
    expect(selectProducedFiles(tailOwner(changed, 6))?.changes).toEqual(changed.changes.slice(0, 1))
    expect(selectProducedFiles(tailOwner({ ...changed, changes: changed.changes.slice(1) }, 6))?.changes).toEqual([])
    const deletionOnly: DeliverablesTurnData = {
      produced: [],
      changes: [{
        seq: 3, turn: 1, callId: 'delete', title: 'Delete',
        diffs: [{ path: 'removed.txt', oldText: 'old', newText: '' }],
      }],
    }
    expect(selectProducedFiles(tailOwner(deletionOnly, 4))).toEqual({
      paths: [], changes: deletionOnly.changes,
    })
    expect(producedForClosing(undefined)).toEqual([])
    expect(selectProducedFiles(tailOwner(undefined, 9, () => {}, 2))).toBeNull()
  })

  it('folds committed receipts while ignoring reads and presentation-only mutation intent', () => {
    const value = assembler([
      at(1, 'turn/start', { turn: 1 }),
      call(2, 'write', diff('out/index.html', 'out/app.css')),
      result(3, 'write', false, 1, undefined, mutations('out/index.html', 'out/app.css')),
      call(4, 'edit', edit('notes.md')),
      result(5, 'edit', false, 1, undefined, mutations('notes.md')),
      call(6, 'read', { card: 'generic', title: 'Read', locations: [{ path: 'input.txt' }] }),
      result(7, 'read'),
      call(8, 'failed', diff('broken.txt')),
      result(9, 'failed', true, 1, undefined, mutations('broken.txt')),
      call(10, 'locationless', { card: 'diff', title: 'Write', diffs: [] }),
      result(11, 'locationless'),
    ])

    expect(producedForClosing(deliverablesOf(value))).toEqual([
      'out/index.html', 'out/app.css', 'notes.md', 'broken.txt',
    ])
  })

  it('publishes validated result-time changes to the incremental view target', () => {
    const applied = {
      card: 'diff' as const, title: 'Updated config',
      diffs: [{ path: 'src/config.ts', oldText: 'false', newText: 'true' }],
    }
    const value = assembler([
      at(1, 'turn/start', { turn: 1 }),
      call(2, 'write', diff('src/config.ts')),
      result(3, 'write', false, 1, applied, [{
        path: 'src/config.ts', operation: 'modify', diffs: applied.diffs.map(({ oldText, newText }) => ({ oldText, newText })),
      }]),
    ])
    expect(changesOf(value).changes).toEqual([{
      seq: 3, turn: 1, callId: 'write', title: 'Updated config', diffs: applied.diffs,
    }])
    expect(deliverablesOf(value)?.changes).toEqual(changesOf(value).changes)

    const malformed = assembler([
      at(1, 'turn/start', { turn: 1 }),
      call(2, 'bad', diff('bad.ts')),
      result(3, 'bad', false, 1, { card: 'diff', diffs: [{ path: 1 }] } as never, [null]),
    ])
    // A malformed authoritative result stays off the Changes surface.
    expect(changesOf(malformed)).toEqual({ changes: [] })
  })

  it('attributes nested Code Mode mutation receipts to the owning Turn', () => {
    const value = assembler([
      at(1, 'turn/start', { turn: 2 }),
      at(2, 'tool/code-dispatch', {
        rootCallId: 'root', parentCallId: 'root', subCallId: 'root:code:1',
        name: 'write', arguments: {}, isError: false, content: [],
        location: { turn: 2, step: 1 },
        mutations: [
          { path: 'nested.ts', operation: 'create', diffs: [{ oldText: null, newText: 'nested' }] },
          { path: 'removed.ts', operation: 'delete', diffs: [{ oldText: 'old', newText: null }] },
        ],
      }),
    ])

    expect(producedForClosing(deliverablesOf(value, 2))).toEqual(['nested.ts'])
    expect(changesOf(value).changes).toEqual([{
      seq: 2,
      turn: 2,
      callId: 'root:code:1',
      title: 'write',
      diffs: [
        { path: 'nested.ts', oldText: null, newText: 'nested' },
        { path: 'removed.ts', oldText: 'old', newText: '' },
      ],
    }])
  })

  it('falls back through call titles and call ids while rejecting non-object diff entries', () => {
    const value = assembler([
      at(1, 'turn/start', { turn: 1 }),
      call(2, 'fallback-title', diff('fallback.ts')),
      result(3, 'fallback-title', false, 1, {
        card: 'diff', diffs: [{ path: 'fallback.ts', oldText: null, newText: 'next' }],
      }, mutations('fallback.ts')),
      result(4, 'orphan-title', false, 1, {
        card: 'diff', diffs: [{ path: 'orphan.ts', oldText: null, newText: 'orphan' }],
      }, mutations('orphan.ts')),
    ])
    expect(changesOf(value).changes.map(change => change.title)).toEqual([
      'Write fallback.ts', 'orphan-title',
    ])

    const malformed = assembler([
      at(1, 'turn/start', { turn: 1 }),
      call(2, 'bad', diff('bad.ts')),
      result(3, 'bad', false, 1, { card: 'diff', diffs: [null] } as never, [{ path: 'bad.ts', operation: 'modify', diffs: [null] }]),
    ])
    expect(changesOf(malformed)).toEqual({ changes: [] })
  })

  it('ignores calls without mutation locations, orphan results, and replacement results', () => {
    const replacement = result(8, 'replacement')
    const value = assembler([
      at(1, 'turn/start', { turn: 1 }),
      at(2, 'tool/call', { turn: 1, step: 1, callId: 'no-view', name: 'fixture', arguments: '{}' }),
      result(3, 'no-view'),
      call(4, 'locationless-edit', { card: 'generic', title: 'Edit', kind: 'edit' }),
      result(5, 'locationless-edit'),
      result(6, 'orphan'),
      call(7, 'replacement', diff('replaced.txt')),
      {
        ...replacement,
        event: {
          ...replacement.event,
          surfaceOp: { op: 'replace', start: 1, end: 1 },
        } as ConversationEventInput['event'],
      },
      at(9, 'turn/end', { turn: 1, reason: { kind: 'completed' } }),
    ])

    expect(producedForClosing(deliverablesOf(value))).toEqual([])
  })

  it('rejects an invalid start match and preserves state for an unrelated update', () => {
    const startMatch = matched(at(1, 'turn/start', { turn: 1 }), 'start')
    const emptyContext: Parameters<typeof deliverablesDefinition.start>[0] = {
      key: 'deliverables:1',
      kind: 'deliverables',
      id: '1',
      matches: [startMatch],
      start: startMatch,
      state: undefined,
      current: new Map(),
    }
    const reader: Parameters<typeof deliverablesDefinition.start>[2] = { previous: () => undefined }
    const state = deliverablesDefinition.start(emptyContext, startMatch, reader)
    const unrelated = matched(at(2, 'turn/end', { turn: 1, reason: { kind: 'completed' } }), 'update')
    const context: Parameters<typeof deliverablesDefinition.update>[0] = { ...emptyContext, state }

    expect(() => deliverablesDefinition.start(emptyContext, unrelated, reader))
      .toThrow('deliverables start requires turn/start')
    expect(deliverablesDefinition.update(context, unrelated)).toBe(state)
  })

  it('replays a tail page once prepend supplies its missing Turn start', () => {
    const value = assembler([
      call(10, 'late', diff('history.txt')),
      result(11, 'late', false, 1, undefined, mutations('history.txt')),
    ], true)
    expect(deliverablesOf(value)).toBeUndefined()

    value.prepend([at(1, 'turn/start', { turn: 1 })], false)
    value.flush()
    expect(producedForClosing(deliverablesOf(value))).toEqual(['history.txt'])
  })

  it('extends the same Turn data incrementally on live append', () => {
    const value = assembler([
      at(1, 'turn/start', { turn: 1 }),
      call(2, 'first', diff('first.txt')),
      result(3, 'first', false, 1, undefined, mutations('first.txt')),
    ])
    const first = deliverablesOf(value)
    expect(producedForClosing(first)).toEqual(['first.txt'])

    value.append(call(4, 'second', diff('second.txt')))
    value.append(result(5, 'second', false, 1, undefined, mutations('second.txt')))
    value.flush()
    expect(producedForClosing(deliverablesOf(value))).toEqual(['first.txt', 'second.txt'])
  })
})

describe('ProducedFiles changed-files card', () => {
  const t = makeTranslate(zh)

  const changes = [{
    seq: 4,
    turn: 1,
    callId: 'write',
    title: 'Write files',
    diffs: [
      { path: 'src/a.ts', oldText: null, newText: 'a\nb' },
      { path: 'src/nested/b.ts', oldText: 'old', newText: 'new' },
      { path: 'README.md', oldText: 'remove', newText: '' },
    ],
  }]

  it('renders aggregate and hierarchical file statistics and opens diffs', () => {
    const openChanges = vi.fn()
    const view = render(
      <ProducedFiles
        matched={{ paths: ['src/a.ts', 'src/nested/b.ts'], changes }}
        openChanges={openChanges}
        t={t}
      />,
    )

    expect(view.getByText('已更改文件（3）')).toBeTruthy()
    expect(view.getAllByLabelText('+3 −2').length).toBeGreaterThan(0)
    const src = view.getByRole('button', { name: /^src/u })
    expect(src.getAttribute('aria-expanded')).toBe('true')
    expect(view.getByRole('button', { name: '查看 src/a.ts 的差异' })).toBeTruthy()
    expect(view.getByRole('button', { name: '查看 src/nested/b.ts 的差异' })).toBeTruthy()
    expect(view.getByRole('button', { name: '查看 README.md 的差异' })).toBeTruthy()

    fireEvent.click(view.getByRole('button', { name: '查看 src/a.ts 的差异' }))
    expect(openChanges).toHaveBeenCalledTimes(1)
    fireEvent.click(view.getByRole('button', { name: '查看差异' }))
    expect(openChanges).toHaveBeenCalledTimes(2)

    fireEvent.click(src)
    expect(src.getAttribute('aria-expanded')).toBe('false')
    expect(view.queryByRole('button', { name: '查看 src/a.ts 的差异' })).toBeNull()
  })

  it('toggles every directory while keeping the hierarchy visible', () => {
    const view = render(
      <ProducedFiles
        matched={{ paths: ['src/a.ts', 'src/nested/b.ts'], changes }}
        openChanges={() => {}}
        t={t}
      />,
    )

    fireEvent.click(view.getByRole('button', { name: '收起全部' }))
    expect(view.getByRole('button', { name: /^src/u }).getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(view.getByRole('button', { name: '展开全部' }))
    expect(view.getByRole('button', { name: /^src/u }).getAttribute('aria-expanded')).toBe('true')

    expect(view.getByRole('button', { name: /^src/u })).toBeTruthy()
    expect(view.getByRole('button', { name: '查看差异' })).toBeTruthy()
  })

  it('uses singular English copy for one changed file', () => {
    const one = [{
      seq: 1, turn: 1, callId: 'write', title: 'Write one',
      diffs: [{ path: 'a.md', oldText: null, newText: 'a' }],
    }]
    const view = render(
      <ProducedFiles
        matched={{ paths: ['a.md'], changes: one }}
        openChanges={() => {}}
        t={makeTranslate(en)}
      />,
    )
    expect(view.getByText('Changed files (1)')).toBeTruthy()
    expect(view.getByRole('button', { name: 'View diff' })).toBeTruthy()
  })
})

describe('producedFileMentions resolver', () => {
  const label = (path: string) => `打开 ${path}`

  it('resolves exact paths and unique basenames; ambiguity and unknowns stay unresolved', () => {
    const opened: string[] = []
    const resolver = producedFileMentions(
      ['out/index.html', 'a/style.css', 'b/style.css'],
      (path) => { opened.push(path) },
      label,
    )
    // Unique basename resolves to its full path; the full path rides title.
    const byBasename = resolver.resolve('index.html')
    expect(byBasename?.label).toBe('打开 out/index.html')
    expect(byBasename?.title).toBe('out/index.html')
    byBasename?.open()
    expect(opened).toEqual(['out/index.html'])
    // An exact path resolves even when its basename is ambiguous.
    const exact = resolver.resolve('a/style.css')
    expect(exact?.title).toBe('a/style.css')
    // A basename two paths share stays unresolved rather than guessing,
    // and so does a token naming nothing the turn wrote.
    expect(resolver.resolve('style.css')).toBeUndefined()
    expect(resolver.resolve('notes.md')).toBeUndefined()
    expect(basename('a\\b\\c.txt')).toBe('c.txt')
  })
})

describe('package shells', () => {
  it('the invariant companion registers ownership', async () => {
    const registered: string[] = []
    const ctx = new Context()
    ctx.provide('invariants')
    ctx.set('invariants', {
      register: (pkg: string) => { registered.push(pkg); return () => {} },
    } as never)
    const dispose = await applyInvariant(ctx)
    expect(registered).toEqual(['@monotykamary/dsh-client-ui-deliverables'])
    expect(dispose).toBeTypeOf('function')
  })
})

describe('plugin registration', () => {
  it('registers the tail entry and fiber disposal removes it', async () => {
    const ctx = new Context()
    await ctx.plugin(SlotRegistry).await()
    await ctx.plugin(ConversationEventRegistry).await()
    await ctx.plugin(ConversationViewRegistry).await()
    // The owning view's child declaration, stood up by a bench root entry.
    ctx.slots.register({
      name: 'root',
      children: {
        'conversation.chat.turnTail': { kind: 'chain', scope: 'session' },
        'workbench.surface': { kind: 'list', scope: 'session' },
      },
    } as never, () => null)
    const disposePresentation = vi.fn()
    const workbench = {
      open: vi.fn(), close: vi.fn(), show: vi.fn(),
      registerPresentation: vi.fn((
        _id: string,
        _presentation: { icon: string; description: string | (() => string) },
      ) => disposePresentation),
    }
    ctx.provide('workbench', workbench)
    ctx.provide('connection', {
      api: { settings: {} },
      isLoopback: false,
      isOperatorEligible: { getSnapshot: () => false, subscribe: () => () => {} },
      hostDescription: { getSnapshot: () => undefined, subscribe: () => () => {} },
    } as never)
    // ui-theme's Appearance row binds a durable scope through these two.
    ctx.provide('remote', { $on: () => () => {} } as never)
    ctx.provide('settingsScope', { bind: () => stubSettingsScope().scope } as never)
    await ctx.plugin({ inject: localeInject, apply: applyLocale }).await()

    const fiber = ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    const [entry] = ctx.slots.entries('conversation.chat.turnTail')
    expect(entry).toBeDefined()
    const injected = entry?.inject?.() as unknown as ProducedFilesInjected
    expect(Object.keys(injected)).toEqual(['openChanges'])
    expect(injected.openChanges).toBeTypeOf('function')
    injected.openChanges()
    expect(workbench.open).toHaveBeenCalledWith('changes')
    const changes = ctx.slots.entries('workbench.surface')[0]
    expect(changes?.options.id).toBe('changes')
    expect(resolveSlotLabel(changes?.options.label)).toBe('Changes')
    expect(workbench.registerPresentation).toHaveBeenCalledOnce()
    const [presentationId, presentation] = workbench.registerPresentation.mock.calls[0]!
    expect(presentationId).toBe('changes')
    expect(presentation.icon).toBe('changes')
    expect(presentation.description).toBeTypeOf('function')

    // The prose face is live while the plugin is: a produced turn yields a
    // resolver whose matches open through the owner-supplied opener.
    const opened: string[] = []
    const owner = tailOwner(
      produced([2, 'site/report.html']),
      3,
      (path) => { opened.push(path) },
    )
    const service = (ctx as unknown as { get(name: string): ChatFileMentions | undefined }).get('chatFileMentions')
    const mentions = service?.forClosing(owner)
    mentions?.resolve('report.html')?.open()
    expect(opened).toEqual(['site/report.html'])
    // A turn that produced nothing yields no vocabulary at all.
    expect(service?.forClosing(tailOwner(undefined, 2))).toBeUndefined()

    await fiber.dispose()
    expect(ctx.slots.entries('conversation.chat.turnTail')).toHaveLength(0)
    expect(ctx.slots.entries('workbench.surface')).toHaveLength(0)
    expect(disposePresentation).toHaveBeenCalledOnce()
    // Fiber teardown retracts the service: the consumer's ctx.get sees the off state.
    expect((ctx as unknown as { get(name: string): unknown }).get('chatFileMentions')).toBeUndefined()
  })
})
