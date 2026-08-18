/**
 * Turn-scoped produced-file Definition and readers. Client-only and
 * model-free: the vocabulary is the mutation tools' own follow-along
 * `locations`, never the closing prose.
 */
import type {
  ConversationMatch, ConversationNodeDefinition, ToolResultNode,
} from '@monotykamary/dsh-client-runtime/client'
import { isAppendSurfaceEvent } from '@monotykamary/dsh-client-runtime/client'
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

/**
 * Paths a call view reports having created or changed, by render intent rather
 * than tool name: a diff card, or a generic card whose kind is `edit` (the
 * shape `str_replace_editor`'s insert presents). Every other card produces
 * nothing to open — a read looked, a delete removed, a terminal ran. Only
 * root call views enter this Turn accumulator; nested Code Mode dispatches
 * preserve the pre-assembly behavior and do not contribute independently.
 */
function producedPaths(view: ToolResultNode['callView']): readonly string[] {
  if (view === null) return []
  if (view.card === 'diff') return (view.locations ?? []).map(location => location.path)
  if (view.card === 'generic' && view.kind === 'edit') {
    return (view.locations ?? []).map(location => location.path)
  }
  return []
}

/** Narrow wire-derived diff values before they reach the strict DiffBlock primitive. */
function narrowDiffs(value: unknown): readonly DiffHunk[] | null {
  if (!Array.isArray(value) || value.length === 0) return null
  const diffs: DiffHunk[] = []
  for (const candidate of value) {
    if (typeof candidate !== 'object' || candidate === null || Array.isArray(candidate)) return null
    const { path, oldText, newText } = candidate as Record<string, unknown>
    if (typeof path !== 'string' || (oldText !== null && typeof oldText !== 'string') || typeof newText !== 'string') {
      return null
    }
    diffs.push({ path, oldText, newText })
  }
  return diffs
}

/** Build one successful mutation group from result-time or call-time diff intent. */
function changeFrom(
  match: ConversationMatch,
  callView: ToolResultNode['callView'],
  callId: string,
  turn: number,
): DeliverableChange | null {
  const resultView = match.view?.for === 'result' && match.view.view.card === 'diff'
    ? match.view.view
    : null
  const fallbackView = callView?.card === 'diff' ? callView : null
  const view = resultView ?? fallbackView
  if (view === null) return null
  const diffs = narrowDiffs(view.diffs)
  if (diffs === null) return null
  return {
    seq: match.event.seq,
    turn,
    callId,
    title: view.title ?? fallbackView?.title ?? callId,
    diffs,
  }
}

/**
 * Files produced by one Turn data value.
 *
 * The source is the mutation tools' own follow-along `locations`, not the
 * closing prose: a produced file must be listed whether or not the model
 * remembered to name it. A mutation is recognized by render intent, not by
 * tool name — a diff card, or a generic card whose `kind` is `edit` (the shape
 * `str_replace_editor`'s insert presents) — so a new mutation tool joins by
 * declaring what it does. Reads contribute nothing (looking at a file does not
 * produce it), and neither do deletes (there is nothing left to open) or
 * failed calls. Paths keep first-seen order and appear once, so a file written
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
  for (const produced of data.produced) {
    if (produced.seq > seq || seen.has(produced.path)) continue
    seen.add(produced.path)
    paths.push(produced.path)
  }
  return paths
}

/** Produced-files row currency, including whether its Turn has a rendered diff. */
export interface ProducedFilesMatch {
  readonly paths: readonly string[]
  readonly hasChanges: boolean
}

/**
 * Claim the turn-tail chain only when its closing turn produced files.
 * @param owner - Turn-tail owner currency for the closing assistant.
 * @returns Produced paths and Changes availability, or null to decline before mount.
 */
export function selectProducedFiles(owner: TurnTailOwnerProps): ProducedFilesMatch | null {
  const data = owner.turn.data.get('deliverables')
  const paths = producedForClosing(data, owner.seq)
  if (paths.length === 0) return null
  return { paths, hasChanges: data?.changes.some(change => change.seq <= owner.seq) === true }
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
    if (match.event.type !== 'tool/result') return context.state
    const result = match.event.data.message.content[0]
    if (result.isError === true) return context.state
    const callId = String(match.event.data.message.source.callId)
    const callView = context.state.calls.get(callId) ?? null
    const additions = producedPaths(callView).map(path => ({ seq: match.event.seq, path }))
    const change = changeFrom(match, callView, callId, context.state.turn)
    if (additions.length === 0 && change === null) return context.state
    return {
      ...context.state,
      produced: additions.length === 0 ? context.state.produced : [...context.state.produced, ...additions],
      changes: change === null ? context.state.changes : [...context.state.changes, change],
    }
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
