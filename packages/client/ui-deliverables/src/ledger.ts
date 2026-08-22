/** Pure projections for the model-facing mutation-ledger reader. */

import type { FileMutation, SessionEvent } from '@monotykamary/dsh-session'
import type {} from '@monotykamary/dsh-tools/types'

/** Coverage statement returned with every ledger read. */
export const COVERAGE = 'Receipt-aware tool mutations only; shell and external changes are not included.'

/** Compact mutation summary used by list pages. */
export interface MutationSummary {
  /** Durable Session-wide mutation order. */
  commitOrder: number
  /** Provider display path recorded by the mutating tool. */
  path: string
  /** Committed file operation. */
  operation: FileMutation['operation']
  /** Added receipt lines across all recorded hunks. */
  additions: number
  /** Removed receipt lines across all recorded hunks. */
  deletions: number
  /** Complete prior-content identity, or null for creation. */
  beforeSha256: string | null
  /** Complete resulting-content identity, or null for deletion. */
  afterSha256: string | null
}

/** One globally ordered mutation with its durable replacement hunks. */
export interface LedgerMutation extends MutationSummary {
  /** Ordered replacement hunks recorded by the tool. */
  diffs: FileMutation['diffs']
}

function lineCount(text: string | null): number {
  if (text === null || text === '') return 0
  const body = text.endsWith('\n') ? text.slice(0, -1) : text
  return body.split('\n').length
}

function toLedgerMutation(mutation: FileMutation): LedgerMutation {
  return {
    commitOrder: mutation.commitOrder,
    path: mutation.path,
    operation: mutation.operation,
    additions: mutation.diffs.reduce((sum, diff) => sum + lineCount(diff.newText), 0),
    deletions: mutation.diffs.reduce((sum, diff) => sum + lineCount(diff.oldText), 0),
    beforeSha256: mutation.beforeSha256,
    afterSha256: mutation.afterSha256,
    diffs: mutation.diffs,
  }
}

/**
 * Read every direct and nested committed mutation from a Session in commit order.
 * @param events - complete current Session event history.
 * @returns detached ledger entries sorted by their durable commit order.
 */
export function mutationLedger(events: readonly SessionEvent[]): LedgerMutation[] {
  const mutations: FileMutation[] = []
  for (const event of events) {
    if (event.type === 'tool/result' || event.type === 'tool/code-dispatch') {
      mutations.push(...(event.data.mutations ?? []))
    }
  }
  return mutations.sort((a, b) => a.commitOrder - b.commitOrder).map(toLedgerMutation)
}

/**
 * Render one mutation's durable intent without claiming unified-patch semantics.
 * @param mutation - committed mutation and its recorded replacement hunks.
 * @returns bounded-reader source text for the selected mutation.
 */
export function renderMutation(mutation: LedgerMutation): string {
  const lines = [
    `Change #${mutation.commitOrder}: ${mutation.operation} ${mutation.path}`,
    `Before SHA-256: ${mutation.beforeSha256 ?? '(absent)'}`,
    `After SHA-256: ${mutation.afterSha256 ?? '(absent)'}`,
  ]
  mutation.diffs.forEach((diff, index) => {
    lines.push(`Hunk ${index + 1}:`)
    if (diff.oldText !== null) {
      lines.push('Removed:')
      lines.push(diff.oldText)
    }
    if (diff.newText !== null) {
      lines.push('Added:')
      lines.push(diff.newText)
    }
  })
  return lines.join('\n')
}

/**
 * Slice text without ending between a UTF-16 surrogate pair.
 * @param text - complete rendered mutation text.
 * @param offset - UTF-16 code-unit offset selected by the caller.
 * @param maxChars - maximum UTF-16 code units in this page.
 * @returns page text and the next offset, or null at the end.
 */
export function boundedText(text: string, offset: number, maxChars: number): { text: string; nextOffset: number | null } {
  let end = Math.min(text.length, offset + maxChars)
  if (end < text.length) {
    const prior = text.charCodeAt(end - 1)
    const next = text.charCodeAt(end)
    if (prior >= 0xD800 && prior <= 0xDBFF && next >= 0xDC00 && next <= 0xDFFF) end--
  }
  return { text: text.slice(offset, end), nextOffset: end < text.length ? end : null }
}
