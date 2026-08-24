export const requiredReadinessJobs = [
  'node-24',
  'node-24-coverage',
  'node-24-consumers',
  'node-compat',
  'python-sdk',
  'python-runtime',
  'windows',
] as const

/** One deterministic check result for an exact source revision. */
export interface ReadinessEvidence {
  /** Required check identifier. */
  id: string
  /** Source revision tested by the check. */
  revision: string
  /** Terminal check result. */
  result: 'success' | 'failure' | 'cancelled' | 'skipped'
}

/** The exact reasons a revision is not ready. */
export interface ReadinessDecision {
  /** True exactly when every required check succeeded for the revision. */
  ready: boolean
  /** Missing, duplicate, foreign-revision, unexpected, or unsuccessful evidence. */
  failures: string[]
}

/**
 * Evaluate the readiness conjunction for one revision.
 * @param revision - Source revision being considered.
 * @param evidence - Terminal deterministic check results.
 * @returns A ready decision iff the evidence set exactly matches the required set and every result succeeded on `revision`.
 */
export function evaluateReadiness(
  revision: string,
  evidence: readonly ReadinessEvidence[],
): ReadinessDecision {
  const required = new Set<string>(requiredReadinessJobs)
  const seen = new Map<string, ReadinessEvidence>()
  const failures: string[] = []

  for (const item of evidence) {
    if (!required.has(item.id)) {
      failures.push(`unexpected check ${item.id}`)
      continue
    }
    if (seen.has(item.id)) {
      failures.push(`duplicate check ${item.id}`)
      continue
    }
    seen.set(item.id, item)
  }

  for (const id of requiredReadinessJobs) {
    const item = seen.get(id)
    if (item === undefined) {
      failures.push(`missing check ${id}`)
      continue
    }
    if (item.revision !== revision) failures.push(`${id} tested ${item.revision}, expected ${revision}`)
    if (item.result !== 'success') failures.push(`${id} ended ${item.result}`)
  }

  return { ready: failures.length === 0, failures }
}
