/**
 * Deliverables plugin, node half. Registers response-format guidance and a
 * bounded reader over the current Session's durable file-mutation receipts.
 * The browser half ships via exports["./client"].
 */

import type { Context } from '@monotykamary/cordis'
import z from '@monotykamary/schemastery'
import { defineTool } from '@monotykamary/dsh-tools'
import type {} from '@monotykamary/dsh-system-prompt'
import { boundedText, COVERAGE, mutationLedger, renderMutation } from './ledger.ts'

/** Services required for model guidance and the mutation-ledger reader. */
export const inject = ['systemPrompt', 'tools']

/** Deployment-owned output bounds for the mutation-ledger reader. */
export interface Config {
  /** Maximum summaries returned by one list call. */
  maxListItems: number
  /** Maximum UTF-16 code units of mutation text returned by one detail page. */
  maxDiffChars: number
}

/** Validated mutation-ledger output bounds. */
export const Config: z<Config> = z.object({
  maxListItems: z.number().step(1).min(1).required(),
  maxDiffChars: z.number().step(1).min(1).required(),
})

const FILE_REFERENCE_PROMPT = 'When you successfully create or modify files, mention the primary outputs in your final response. '
  + 'To make those and any other changed-file references clickable in Web, format them as Markdown inline code using the exact file-tool path, or a basename when unique among the files changed in that turn.'

const itemSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    commitOrder: { type: 'integer', required: true },
    path: { type: 'string', required: true },
    operation: { type: 'string', required: true, enum: ['create', 'modify', 'delete'] },
    additions: { type: 'integer', required: true },
    deletions: { type: 'integer', required: true },
    beforeSha256: { type: 'string' },
    afterSha256: { type: 'string' },
  },
} as const

/** Register Web file guidance and the current-Session `changes_read` tool. */
export function apply(ctx: Context, config: Config): void {
  ctx.systemPrompt.section({
    name: 'ui:deliverable-file-references',
    order: 190,
    text: FILE_REFERENCE_PROMPT,
  })

  ctx.tools.register(defineTool({
    name: 'changes_read',
    description: 'Read file changes committed by receipt-aware tools in this Session. Call without commit_order to list changes in durable commit order; call with commit_order to read that change\'s recorded replacement hunks. Use the returned SHA-256 identities and ordinary file reads to reconcile later workspace divergence. Shell and external changes are outside this ledger.',
    parameters: {
      after_commit_order: { type: 'integer', description: 'List only changes after this commit order.' },
      commit_order: { type: 'integer', description: 'Read one exact change instead of listing summaries.' },
      offset: { type: 'integer', description: 'UTF-16 offset for the next page of one exact change; valid only with commit_order.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          kind: { type: 'string', required: true, enum: ['list', 'detail'] },
          coverage: { type: 'string', required: true },
          items: { type: 'array', required: true, items: itemSchema },
          nextAfterCommitOrder: { type: 'integer' },
          commitOrder: { type: 'integer' },
          text: { type: 'string' },
          offset: { type: 'integer' },
          nextOffset: { type: 'integer' },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: value.kind === 'list'
          ? value.items.length === 0
            ? `No recorded file mutations. ${value.coverage}`
            : [
              `Recorded file mutations (${value.items.length}):`,
              ...value.items.flatMap(item => [
                `#${item.commitOrder} ${item.operation} ${item.path} (+${item.additions} -${item.deletions})`,
                `  before SHA-256: ${item.beforeSha256 ?? '(absent)'}`,
                `  after SHA-256: ${item.afterSha256 ?? '(absent)'}`,
              ]),
              ...(value.nextAfterCommitOrder === undefined ? [] : [`Continue with after_commit_order=${value.nextAfterCommitOrder}.`]),
              value.coverage,
            ].join('\n')
          : [
            value.text ?? '',
            ...(value.nextOffset === undefined ? [] : [`Continue change #${value.commitOrder} with offset=${value.nextOffset}.`]),
            value.coverage,
          ].join('\n'),
      }],
    },
    execute(args, exec) {
      if (exec.agent === undefined) throw new Error('changes_read requires an owning agent session')
      for (const [name, value] of [['after_commit_order', args.after_commit_order], ['commit_order', args.commit_order], ['offset', args.offset]] as const) {
        if (value !== undefined && value < 0) throw new Error(`changes_read ${name} must be nonnegative`)
      }
      if (args.commit_order === undefined && args.offset !== undefined) {
        throw new Error('changes_read offset requires commit_order')
      }
      if (args.commit_order !== undefined && args.after_commit_order !== undefined) {
        throw new Error('changes_read commit_order cannot be combined with after_commit_order')
      }
      const ledger = mutationLedger(exec.agent.session.events)
      if (args.commit_order === undefined) {
        const afterCommitOrder = args.after_commit_order
        const eligible = afterCommitOrder === undefined
          ? ledger
          : ledger.filter(item => item.commitOrder > afterCommitOrder)
        const items = eligible.slice(0, config.maxListItems).map(({ diffs: _diffs, beforeSha256, afterSha256, ...item }) => ({
          ...item,
          ...(beforeSha256 === null ? {} : { beforeSha256 }),
          ...(afterSha256 === null ? {} : { afterSha256 }),
        }))
        const lastItem = items.at(-1)
        return Promise.resolve({
          kind: 'list' as const,
          coverage: COVERAGE,
          items,
          ...(eligible.length > items.length && lastItem !== undefined
            ? { nextAfterCommitOrder: lastItem.commitOrder }
            : {}),
        })
      }
      const mutation = ledger.find(item => item.commitOrder === args.commit_order)
      if (mutation === undefined) throw new Error(`changes_read cannot find commit order ${args.commit_order}`)
      const offset = args.offset ?? 0
      const rendered = renderMutation(mutation)
      if (offset > rendered.length) throw new Error(`changes_read offset ${offset} exceeds change length ${rendered.length}`)
      const page = boundedText(rendered, offset, config.maxDiffChars)
      return Promise.resolve({
        kind: 'detail' as const,
        coverage: COVERAGE,
        items: [],
        commitOrder: mutation.commitOrder,
        text: page.text,
        offset,
        ...(page.nextOffset === null ? {} : { nextOffset: page.nextOffset }),
      })
    },
    presentCall: args => ({
      card: 'generic',
      title: args.commit_order === undefined ? 'List file changes' : `Read file change #${args.commit_order}`,
      kind: 'read',
    }),
  }))
}
