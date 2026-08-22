/**
 * Turn-scoped produced-file Definition and readers. Client-only and
 * model-free: committed mutation receipts are the vocabulary, never tool
 * presentation intent or the closing prose.
 */
import type {
  ConversationMatch, ConversationNodeDefinition, ToolResultNode,
} from '@monotykamary/dsh-client-runtime/client'
import { isAppendSurfaceEvent } from '@monotykamary/dsh-client-runtime/client'
import type {} from '@monotykamary/dsh-tools/types'
import type { DiffHunk, MarkdownFileMentions } from '@monotykamary/dsh-client-ui-primitives'
import type { TurnTailOwnerProps } from '@monotykamary/dsh-client-ui-conversation/client'
import type { DeliverableChange, DeliverablesTurnData } from './contract.ts'

export type { DeliverableChange, DeliverablesTurnData } from './contract.ts'

declare module '@monotykamary/dsh-client-runtime/client' {
  interface ConversationTurnDataMap {
    /** Successful mutation paths accumulated in this Turn. */
    deliverables: DeliverablesTurnData
  }
}

interface DeliverablesState extends DeliverablesTurnData {
  readonly turn: number
  readonly calls: ReadonlyMap<string, ToolResultNode['callView']>
}

interface MutationProjection {
  readonly commitOrder: number
  readonly produced: readonly { readonly path: string; readonly commitOrder: number }[]
  readonly diffs: readonly DiffHunk[]
}

const SHA1 = /^[a-f0-9]{40}$/u
const SHA256 = /^[a-f0-9]{64}$/u

interface ReceiptChange {
  readonly produced: readonly { readonly path: string; readonly commitOrder: number }[]
  readonly change: DeliverableChange
}

/** Narrow durable mutation receipts before projecting them into UI primitives. */
function projectMutations(value: unknown): MutationProjection | null {
  if (!Array.isArray(value) || value.length === 0) return null
  const produced: Array<{ path: string; commitOrder: number }> = []
  const diffs: DiffHunk[] = []
  let commitOrder = Number.POSITIVE_INFINITY
  const candidates: unknown[] = value
  const ordered = [...candidates].sort((left, right) => {
    const a = typeof left === 'object' && left !== null ? (left as Record<string, unknown>).commitOrder : 0
    const b = typeof right === 'object' && right !== null ? (right as Record<string, unknown>).commitOrder : 0
    return typeof a === 'number' && typeof b === 'number' ? a - b : 0
  })
  for (const candidate of ordered) {
    if (typeof candidate !== 'object' || candidate === null || Array.isArray(candidate)) return null
    const record = candidate as Record<string, unknown>
    if (record.version !== 1
      || typeof record.commitOrder !== 'number' || !Number.isSafeInteger(record.commitOrder) || record.commitOrder < 0
      || (record.beforeSha1 !== null && (typeof record.beforeSha1 !== 'string' || !SHA1.test(record.beforeSha1)))
      || (record.afterSha1 !== null && (typeof record.afterSha1 !== 'string' || !SHA1.test(record.afterSha1)))
      || (record.beforeSha256 !== null && (typeof record.beforeSha256 !== 'string' || !SHA256.test(record.beforeSha256)))
      || (record.afterSha256 !== null && (typeof record.afterSha256 !== 'string' || !SHA256.test(record.afterSha256)))
      || record.operation === 'create'
        && (record.beforeSha1 !== null || record.afterSha1 === null || record.beforeSha256 !== null || record.afterSha256 === null)
      || record.operation === 'modify'
        && (record.beforeSha1 === null || record.afterSha1 === null || record.beforeSha256 === null || record.afterSha256 === null)
      || record.operation === 'delete'
        && (record.beforeSha1 === null || record.afterSha1 !== null || record.beforeSha256 === null || record.afterSha256 !== null)
      || typeof record.path !== 'string' || record.path.trim() === ''
      || (record.operation !== 'create' && record.operation !== 'modify' && record.operation !== 'delete')
      || !Array.isArray(record.diffs) || record.diffs.length === 0) return null
    commitOrder = Math.min(commitOrder, record.commitOrder)
    if (record.operation !== 'delete') produced.push({ path: record.path, commitOrder: record.commitOrder })
    for (const diff of record.diffs) {
      if (typeof diff !== 'object' || diff === null || Array.isArray(diff)) return null
      const { oldText, newText } = diff as Record<string, unknown>
      if ((oldText !== null && typeof oldText !== 'string')
        || (newText !== null && typeof newText !== 'string')
        || oldText === null && newText === null
        || record.operation === 'create' && oldText !== null
        || record.operation === 'delete' && newText !== null) return null
      diffs.push({ path: record.path, oldText, newText: newText ?? '' })
    }
  }
  return diffs.length === 0 ? null : { commitOrder, produced, diffs }
}

/** Build one change from committed mutation receipts. */
function changeFromMutations(
  match: ConversationMatch,
  mutations: unknown,
  callId: string,
  title: string,
  turn: number,
): ReceiptChange | null {
  const projection = projectMutations(mutations)
  if (projection === null) return null
  return {
    produced: projection.produced,
    change: { seq: match.event.seq, commitOrder: projection.commitOrder, turn, callId, title, diffs: projection.diffs },
  }
}

/** Add one committed receipt projection to its Turn accumulator. */
function appendReceipt(
  state: DeliverablesState,
  match: ConversationMatch,
  receipt: ReceiptChange,
): DeliverablesState {
  return {
    ...state,
    produced: [...state.produced, ...receipt.produced.map(item => ({ seq: match.event.seq, ...item }))],
    changes: [...state.changes, receipt.change],
  }
}

/**
 * Files produced by one Turn data value.
 *
 * The source is each tool execution's committed mutation receipts, not
 * presentation metadata or closing prose. Calls without valid receipts
 * contribute nothing; deletes remain visible in Changes but produce no
 * openable file. Direct and nested Code Mode calls use the same receipt
 * vocabulary. Paths keep first-seen order and appear once, so a file written
 * and then edited in the same turn is one entry.
 *
 * The Conversation Location index owns turn membership before this function
 * runs, so paths cannot spill across turns and this derivation does not infer
 * boundaries from neighboring presentation Nodes.
 * @param data - engine-published Deliverables data for one Turn.
 * @param seq - closing Assistant seq; later Tool settlements are excluded.
 * @returns Produced paths in first-seen order; empty when the turn wrote nothing.
 */
export function producedForClosing(
  data: Readonly<DeliverablesTurnData> | undefined,
  seq = Number.POSITIVE_INFINITY,
): readonly string[] {
  if (data === undefined) return []
  const paths: string[] = []
  const seen = new Set<string>()
  for (const produced of [...data.produced].sort((a, b) => a.commitOrder - b.commitOrder)) {
    if (produced.seq > seq || seen.has(produced.path)) continue
    seen.add(produced.path)
    paths.push(produced.path)
  }
  return paths
}

/** Changed-files card currency at one closing Assistant sequence. */
export interface ProducedFilesMatch {
  /** Successfully created or modified paths available to inline mentions. */
  readonly paths: readonly string[]
  /** Committed mutation groups visible before the closing message. */
  readonly changes: readonly DeliverableChange[]
}

/**
 * Claim the turn-tail chain when committed mutations precede the closing message.
 * @param owner - Turn-tail owner currency for the closing assistant.
 * @returns Mention paths and changed-file groups, or null when neither exists.
 */
export function selectProducedFiles(owner: TurnTailOwnerProps): ProducedFilesMatch | null {
  const data = owner.turn.data.get('deliverables')
  const paths = producedForClosing(data, owner.seq)
  const changes = data?.changes.filter(change => change.seq <= owner.seq) ?? []
  if (paths.length === 0 && changes.length === 0) return null
  return { paths, changes }
}

/** Turn-local successful mutation accumulator; it publishes no view Node. */
export const deliverablesDefinition: ConversationNodeDefinition<DeliverablesState> = {
  kind: 'deliverables',
  target: 'deliverables',
  match: (event) => {
    if (event.type === 'turn/start') return { id: String(event.data.turn), role: 'start' }
    if (event.type === 'tool/call') return { id: String(event.data.turn), role: 'update' }
    if (event.type === 'tool/result' && isAppendSurfaceEvent(event)) {
      return { id: String(event.data.turn), role: 'update' }
    }
    if (event.type === 'tool/code-dispatch' && event.data.location !== undefined) {
      return { id: String(event.data.location.turn), role: 'update' }
    }
    return null
  },
  start: (_context, match) => {
    if (match.event.type !== 'turn/start') throw new Error('deliverables start requires turn/start')
    return { turn: match.event.data.turn, calls: new Map(), produced: [], changes: [] }
  },
  update: (context, match) => {
    if (match.event.type === 'tool/call') {
      const calls = new Map(context.state.calls)
      calls.set(
        String(match.event.data.callId),
        match.view?.for === 'call' ? match.view.view : null,
      )
      return { ...context.state, calls }
    }
    if (match.event.type === 'tool/result') {
      const callId = String(match.event.data.message.source.callId)
      const callView = context.state.calls.get(callId) ?? null
      const resultTitle = match.view?.for === 'result' ? match.view.view.title : undefined
      const receipt = changeFromMutations(
        match, match.event.data.mutations, callId, resultTitle ?? callView?.title ?? callId, context.state.turn,
      )
      return receipt === null ? context.state : appendReceipt(context.state, match, receipt)
    }
    if (match.event.type === 'tool/code-dispatch') {
      const callId = String(match.event.data.subCallId)
      const receipt = changeFromMutations(
        match, match.event.data.mutations, callId, match.event.data.name, context.state.turn,
      )
      return receipt === null ? context.state : appendReceipt(context.state, match, receipt)
    }
    return context.state
  },
  buildLocationData: (context, scope) => scope !== 'turn' || context.state === undefined
    ? null
    : {
      kind: 'turn',
      turn: context.state.turn,
      key: 'deliverables',
      value: { produced: context.state.produced, changes: context.state.changes },
    },
  buildViewNode: context => context.state === undefined || context.state.changes.length === 0
    ? null
    : {
      key: context.key,
      kind: 'deliverables',
      id: String(context.state.turn),
      target: 'deliverables',
      data: {
        turn: context.state.turn,
        produced: context.state.produced,
        changes: context.state.changes,
      },
    },
}

/**
 * Trailing path segment, the part that identifies the file at a glance.
 * @param path - Slash- or backslash-separated path.
 * @returns The final segment, or the whole string when separator-free.
 */
export function basename(path: string): string {
  const at = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  return at === -1 ? path : path.slice(at + 1)
}

/**
 * File-mention vocabulary over one turn's produced paths, for the closing
 * message's prose: an inline-code token opens the file it names. A token
 * resolves by exact path, or by being exactly the basename of exactly one
 * produced path — a basename two paths share stays inert rather than
 * guessing, so a mention link can never open the wrong file or 404.
 * @param paths - The turn's produced paths (tool order, already deduped).
 * @param openFile - The chat view's file opener.
 * @param label - Localizes the accessible open-label for a resolved path.
 * @returns The resolver MarkdownText consumes; the full path rides `title`,
 * the same disambiguator the row's chips carry.
 */
export function producedFileMentions(
  paths: readonly string[],
  openFile: (path: string) => void,
  label: (path: string) => string,
): MarkdownFileMentions {
  return {
    resolve(value) {
      const path = paths.includes(value) ? value : onlyPathWithBasename(paths, value)
      if (path === undefined) return undefined
      return { open: () => { openFile(path) }, label: label(path), title: path }
    },
  }
}

/** The single produced path whose basename is exactly `value`, else undefined. */
function onlyPathWithBasename(paths: readonly string[], value: string): string | undefined {
  const matches = paths.filter(path => basename(path) === value)
  return matches.length === 1 ? matches[0] : undefined
}
