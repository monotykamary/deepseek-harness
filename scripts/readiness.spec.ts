import { describe, expect, it } from 'vitest'
import { evaluateReadiness, requiredReadinessJobs, type ReadinessEvidence } from './readiness.ts'

const revision = 'abc123'
const results = ['success', 'failure', 'cancelled', 'skipped'] as const

function evidence(overrides: Partial<Record<string, ReadinessEvidence['result']>> = {}): ReadinessEvidence[] {
  return requiredReadinessJobs.map(id => ({
    id,
    revision,
    result: overrides[id] ?? 'success',
  }))
}

describe('revision readiness', () => {
  it('accepts the exact required set when every check succeeds on the revision', () => {
    expect(evaluateReadiness(revision, evidence())).toEqual({ ready: true, failures: [] })
  })

  it('rejects every non-all-success result vector', () => {
    const vector = Array<ReadinessEvidence['result']>(requiredReadinessJobs.length).fill('success')
    let visited = 0

    const visit = (index: number): void => {
      if (index === vector.length) {
        const subject = requiredReadinessJobs.map((id, resultIndex) => ({
          id,
          revision,
          result: vector[resultIndex]!,
        }))
        const allSucceeded = vector.every(result => result === 'success')
        expect(evaluateReadiness(revision, subject).ready).toBe(allSucceeded)
        visited += 1
        return
      }
      for (const result of results) {
        vector[index] = result
        visit(index + 1)
      }
    }

    visit(0)
    expect(visited).toBe(4 ** requiredReadinessJobs.length)
  })

  it('rejects incomplete, duplicate, unexpected, and foreign-revision evidence', () => {
    const complete = evidence()
    expect(evaluateReadiness(revision, complete.slice(1))).toMatchObject({ ready: false })
    expect(evaluateReadiness(revision, [...complete, complete[0]!])).toMatchObject({ ready: false })
    expect(evaluateReadiness(revision, [...complete, { id: 'other', revision, result: 'success' }])).toMatchObject({ ready: false })
    expect(evaluateReadiness(revision, complete.map((item, index) => index === 0
      ? { ...item, revision: 'other' }
      : item))).toMatchObject({ ready: false })
  })
})
