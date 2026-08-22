import { Context } from '@monotykamary/cordis'
import { CallId } from '@monotykamary/dsh-llm'
import type { FileMutation, SessionEvent } from '@monotykamary/dsh-session'
import SystemPrompt from '@monotykamary/dsh-system-prompt'
import ToolRuntime from '@monotykamary/dsh-tools'
import { afterEach, describe, expect, it } from 'vitest'
import { apply, inject } from '../src/index.ts'
import { boundedText, mutationLedger, renderMutation } from '../src/ledger.ts'

const sha = (char: string): string => char.repeat(64)
const mutation = (commitOrder: number, path: string, oldText: string | null, newText: string | null): FileMutation => ({
  version: 1,
  commitOrder,
  beforeSha1: oldText === null ? null : 'a'.repeat(40),
  afterSha1: newText === null ? null : 'b'.repeat(40),
  beforeSha256: oldText === null ? null : sha('a'),
  afterSha256: newText === null ? null : sha('b'),
  path,
  operation: oldText === null ? 'create' : newText === null ? 'delete' : 'modify',
  diffs: [{ oldText, newText }],
})

const events = (mutations: FileMutation[]): SessionEvent[] => [
  { type: 'tool/result', seq: 1, time: 1, data: { mutations: [mutations[1]] } } as unknown as SessionEvent,
  { type: 'tool/code-dispatch', seq: 2, time: 2, data: { mutations: [mutations[0]] } } as unknown as SessionEvent,
]

function text(result: { content: Array<{ type: string; text?: string }> }): string {
  return result.content.map(block => block.text ?? '').join('')
}

let ctx: Context | undefined

afterEach(async () => {
  await ctx?.fiber.dispose()
  ctx = undefined
})

describe('mutation ledger projection', () => {
  it('orders direct and nested receipts by durable commit order', () => {
    const ledger = mutationLedger(events([
      mutation(2, 'src/second.ts', 'old\n', 'new\n'),
      mutation(5, 'src/fifth.ts', null, 'created\n'),
    ]))
    expect(ledger.map(item => [item.commitOrder, item.path])).toEqual([
      [2, 'src/second.ts'],
      [5, 'src/fifth.ts'],
    ])
    expect(ledger.map(item => [item.additions, item.deletions])).toEqual([[1, 1], [1, 0]])
  })

  it('renders recorded intent without unified-patch claims and pages on safe boundaries', () => {
    const rendered = renderMutation({ ...mutationLedger(events([
      mutation(0, 'unused.ts', 'x', 'y'),
      mutation(3, 'src/emoji.ts', 'before', 'after🙂tail'),
    ]))[1]! })
    expect(rendered).toContain('Change #3: modify src/emoji.ts')
    expect(rendered).toContain('Removed:\nbefore\nAdded:\nafter🙂tail')
    const emoji = rendered.indexOf('🙂')
    const page = boundedText(rendered, 0, emoji + 1)
    expect(page.text.endsWith('\ud83d')).toBe(false)
    expect(page.nextOffset).toBe(emoji)
  })
})

describe('changes_read', () => {
  it('lists and pages exact changes from the owning Session', async () => {
    ctx = new Context()
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    await ctx.plugin({ apply, inject }, { maxListItems: 1, maxDiffChars: 48 })
    const history = events([
      mutation(0, 'src/one.ts', 'one\n', 'two\n'),
      mutation(1, 'src/two.ts', null, 'created\n'),
    ])
    const agent = { id: 'changes-agent', session: { events: history } } as never
    const execute = (arguments_: Record<string, unknown>) => ctx!.tools.execute({
      signal: new AbortController().signal,
      callId: CallId(`changes-${JSON.stringify(arguments_)}`),
      name: 'changes_read',
      arguments: arguments_,
      agent,
    })

    const first = await execute({})
    expect(first.isError).toBe(false)
    expect(text(first)).toContain('#0 modify src/one.ts (+1 -1)')
    expect(text(first)).toContain(`before SHA-256: ${sha('a')}`)
    expect(text(first)).toContain(`after SHA-256: ${sha('b')}`)
    expect(text(first)).toContain('Continue with after_commit_order=0.')
    expect(text(first)).toContain('shell and external changes are not included')

    const second = await execute({ after_commit_order: 0 })
    expect(text(second)).toContain('#1 create src/two.ts (+1 -0)')

    const detail = await execute({ commit_order: 0 })
    expect(text(detail)).toContain('Change #0: modify src/one.ts')
    expect(text(detail)).toContain('Continue change #0 with offset=')
    const nextOffset = detail.value !== undefined && typeof detail.value === 'object'
      ? (detail.value as { nextOffset?: number }).nextOffset
      : undefined
    expect(nextOffset).toBeTypeOf('number')
    const tail = await execute({ commit_order: 0, offset: nextOffset })
    expect(text(tail)).toContain('Receipt-aware tool mutations only')
  })

  it('rejects ownerless and contradictory reads', async () => {
    ctx = new Context()
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    await ctx.plugin({ apply, inject }, { maxListItems: 5, maxDiffChars: 100 })
    const bare = await ctx.tools.execute({
      signal: new AbortController().signal,
      callId: CallId('ownerless'),
      name: 'changes_read',
      arguments: {},
    })
    expect(bare.isError).toBe(true)
    expect(text(bare)).toContain('requires an owning agent session')

    const agent = { id: 'changes-agent', session: { events: [] } } as never
    const invalid = await ctx.tools.execute({
      signal: new AbortController().signal,
      callId: CallId('invalid'),
      name: 'changes_read',
      arguments: { offset: 2 },
      agent,
    })
    expect(invalid.isError).toBe(true)
    expect(text(invalid)).toContain('offset requires commit_order')
  })
})
