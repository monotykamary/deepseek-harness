import type { FileMutation } from './types.ts'

const RECEIPT_KEYS = new Set([
  'version', 'commitOrder', 'beforeSha1', 'afterSha1', 'beforeSha256', 'afterSha256', 'path', 'operation', 'diffs',
])
const SHA1 = /^[a-f0-9]{40}$/u
const SHA256 = /^[a-f0-9]{64}$/u
const DIFF_KEYS = new Set(['oldText', 'newText'])

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

/**
 * Read commit-order values after receipt validation.
 * @param value - Optional event-data mutations member.
 * @returns Commit orders present in the supplied array.
 */
export function fileMutationOrders(value: unknown): readonly number[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((candidate) => {
    const mutation = record(candidate)
    return typeof mutation?.['commitOrder'] === 'number' ? [mutation['commitOrder']] : []
  })
}

/**
 * Validate durable file mutation receipt vocabulary.
 * @param value - Optional event-data mutations member.
 * @param subject - Event location included in rejection messages.
 * @returns Nothing; acceptance narrows the optional value to current receipts.
 */
export function assertFileMutations(value: unknown, subject: string): asserts value is FileMutation[] | undefined {
  if (value === undefined) return
  if (!Array.isArray(value) || value.length === 0) throw new Error(`${subject} has invalid file mutations`)
  for (const [index, candidate] of value.entries()) {
    const mutation = record(candidate)
    const location = `${subject} file mutation at index ${index}`
    if (mutation === undefined
      || Object.keys(mutation).some(key => !RECEIPT_KEYS.has(key))
      || mutation['version'] !== 1
      || typeof mutation['commitOrder'] !== 'number'
      || !Number.isSafeInteger(mutation['commitOrder'])
      || mutation['commitOrder'] < 0
      || (mutation['beforeSha1'] !== null
        && (typeof mutation['beforeSha1'] !== 'string' || !SHA1.test(mutation['beforeSha1'])))
      || (mutation['afterSha1'] !== null
        && (typeof mutation['afterSha1'] !== 'string' || !SHA1.test(mutation['afterSha1'])))
      || (mutation['beforeSha256'] !== null
        && (typeof mutation['beforeSha256'] !== 'string' || !SHA256.test(mutation['beforeSha256'])))
      || (mutation['afterSha256'] !== null
        && (typeof mutation['afterSha256'] !== 'string' || !SHA256.test(mutation['afterSha256'])))
      || mutation['operation'] === 'create' && (mutation['beforeSha1'] !== null || mutation['beforeSha256'] !== null)
      || mutation['operation'] === 'create' && (mutation['afterSha1'] === null || mutation['afterSha256'] === null)
      || mutation['operation'] === 'modify' && (mutation['beforeSha1'] === null || mutation['afterSha1'] === null)
      || mutation['operation'] === 'delete' && (mutation['beforeSha1'] === null || mutation['afterSha1'] !== null)
      || mutation['operation'] === 'create' && mutation['beforeSha256'] !== null
      || mutation['operation'] === 'create' && mutation['afterSha256'] === null
      || mutation['operation'] === 'modify' && (mutation['beforeSha256'] === null || mutation['afterSha256'] === null)
      || mutation['operation'] === 'delete' && mutation['beforeSha256'] === null
      || mutation['operation'] === 'delete' && mutation['afterSha256'] !== null
      || typeof mutation['path'] !== 'string'
      || mutation['path'].trim() === ''
      || (mutation['operation'] !== 'create' && mutation['operation'] !== 'modify' && mutation['operation'] !== 'delete')
      || !Array.isArray(mutation['diffs'])
      || mutation['diffs'].length === 0) {
      throw new Error(`${location} is invalid`)
    }
    for (const [diffIndex, candidateDiff] of mutation['diffs'].entries()) {
      const diff = record(candidateDiff)
      const oldText = diff?.['oldText']
      const newText = diff?.['newText']
      if (diff === undefined
        || Object.keys(diff).some(key => !DIFF_KEYS.has(key))
        || (oldText !== null && typeof oldText !== 'string')
        || (newText !== null && typeof newText !== 'string')
        || oldText === null && newText === null
        || mutation['operation'] === 'create' && oldText !== null
        || mutation['operation'] === 'delete' && newText !== null) {
        throw new Error(`${location} diff at index ${diffIndex} is invalid`)
      }
    }
  }
}
