import { describe, expect, it } from 'vitest'
import type { ConversationTimelineSnapshot } from '@monotykamary/dsh-client-runtime/client'
import type { DeliverablesViewNode } from '../src/client/contract.ts'
import {
  DeliverablesSnapshotBuilder, EMPTY_DELIVERABLES_SNAPSHOT, deliverablesViewDefinition,
} from '../src/client/deliverables-view.ts'

function node(turn: number, callId: string, title = callId): DeliverablesViewNode {
  return {
    key: `deliverables:${String(turn)}`,
    kind: 'deliverables',
    id: String(turn),
    target: 'deliverables',
    data: {
      turn,
      produced: [{ seq: turn, commitOrder: turn, path: `${callId}.ts` }],
      changes: [{
        seq: turn, commitOrder: turn, turn, callId, title,
        diffs: [{ path: `${callId}.ts`, oldText: null, newText: callId }],
      }],
    },
  }
}

const timeline: ConversationTimelineSnapshot = {
  turnOrder: [1, 2],
  turns: new Map(),
}

describe('DeliverablesSnapshotBuilder', () => {
  it('orders replacement nodes by the engine timeline and applies keyed updates', () => {
    const builder = new DeliverablesSnapshotBuilder()
    expect(builder.empty).toBe(EMPTY_DELIVERABLES_SNAPSHOT)
    expect(builder.replace({ nodes: [], timeline })).toBe(EMPTY_DELIVERABLES_SNAPSHOT)

    const first = builder.replace({ nodes: [node(2, 'two'), node(1, 'one')], timeline })
    expect(first.changes.map(change => change.callId)).toEqual(['one', 'two'])

    const next = builder.apply({ upserts: [node(1, 'one', 'Updated one')], timeline })
    expect(next.changes.map(change => change.title)).toEqual(['Updated one', 'two'])
    expect(deliverablesViewDefinition.create()).toBeInstanceOf(DeliverablesSnapshotBuilder)
  })
})
