import type {
  ConversationTimelineSnapshot, ConversationViewBuilder, ConversationViewDefinition,
} from '@monotykamary/dsh-client-runtime/client'
import type { DeliverablesSnapshot, DeliverablesViewNode } from './contract.ts'

const EMPTY_CHANGES: readonly never[] = []

/** Stable empty target before any loaded Turn publishes a diff. */
export const EMPTY_DELIVERABLES_SNAPSHOT: DeliverablesSnapshot = { changes: EMPTY_CHANGES }

/** Incremental view builder aggregating Turn-owned mutation groups. */
export class DeliverablesSnapshotBuilder implements ConversationViewBuilder<DeliverablesViewNode, DeliverablesSnapshot> {
  private readonly nodes = new Map<string, DeliverablesViewNode>()
  readonly empty = EMPTY_DELIVERABLES_SNAPSHOT

  replace(input: {
    readonly nodes: readonly DeliverablesViewNode[]
    readonly timeline: ConversationTimelineSnapshot
  }): DeliverablesSnapshot {
    this.nodes.clear()
    for (const node of input.nodes) this.nodes.set(node.key, node)
    return this.snapshot(input.timeline)
  }

  apply(input: {
    readonly upserts: readonly DeliverablesViewNode[]
    readonly timeline: ConversationTimelineSnapshot
  }): DeliverablesSnapshot {
    for (const node of input.upserts) this.nodes.set(node.key, node)
    return this.snapshot(input.timeline)
  }

  private snapshot(timeline: ConversationTimelineSnapshot): DeliverablesSnapshot {
    if (this.nodes.size === 0) return EMPTY_DELIVERABLES_SNAPSHOT
    const turnOrder = new Map(timeline.turnOrder.map((turn, index) => [turn, index]))
    const rank = (turn: number): number => {
      const index = turnOrder.get(turn)
      /* v8 ignore next -- every target node belongs to an Engine-owned Turn in this timeline. */
      if (index === undefined) throw new Error(`deliverables view has no timeline Turn ${String(turn)}`)
      return index
    }
    const changes = [...this.nodes.values()]
      .sort((left, right) => rank(left.data.turn) - rank(right.data.turn))
      .flatMap(node => node.data.changes)
    return { changes }
  }
}

/** Deliverables view target contributed beside the Turn Definition. */
export const deliverablesViewDefinition: ConversationViewDefinition<DeliverablesViewNode, DeliverablesSnapshot> = {
  target: 'deliverables',
  create: () => new DeliverablesSnapshotBuilder(),
}
