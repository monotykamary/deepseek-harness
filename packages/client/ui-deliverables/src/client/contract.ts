import type { DiffHunk } from '@monotykamary/dsh-client-ui-primitives'
import type { ConversationViewNode } from '@monotykamary/dsh-client-runtime/client'

/** One mutation path published in its owning Turn. */
export interface ProducedPath {
  /** Tool result event seq that carried the mutation. */
  readonly seq: number
  /** ToolRuntime commit order. */
  readonly commitOrder: number
  /** Tool-authored path. */
  readonly path: string
}

/** One successful mutation call with the applied diff it published. */
export interface DeliverableChange {
  /** Tool result event seq. */
  readonly seq: number
  /** Earliest ToolRuntime commit order in this call. */
  readonly commitOrder: number
  /** Owning Turn number. */
  readonly turn: number
  /** Stable Tool call identity. */
  readonly callId: string
  /** Tool-presented mutation title. */
  readonly title: string
  /** Validated applied or intended diff hunks. */
  readonly diffs: readonly DiffHunk[]
}

/** Immutable produced-file and diff facts published against one Turn. */
export interface DeliverablesTurnData {
  /** Successful mutation paths in commit order. */
  readonly produced: readonly ProducedPath[]
  /** Validated diff-bearing mutation groups carrying commit order. */
  readonly changes: readonly DeliverableChange[]
}

/** One workbench target node contributed by a Turn with changes. */
export interface DeliverablesViewNode extends ConversationViewNode {
  readonly target: 'deliverables'
  readonly kind: 'deliverables'
  readonly data: DeliverablesTurnData & { readonly turn: number }
}

/** Incremental snapshot consumed by the workbench Changes surface. */
export interface DeliverablesSnapshot {
  /** Loaded-window changes in Engine Turn order. */
  readonly changes: readonly DeliverableChange[]
}

declare module '@monotykamary/dsh-client-runtime/client' {
  interface ConversationViewSnapshotMap {
    /** Successful loaded-window file mutations in Turn order. */
    deliverables: DeliverablesSnapshot
  }
}
