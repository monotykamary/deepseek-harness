import { createHash } from 'node:crypto'

/**
 * Hash an already-JSON-shaped value independently of object insertion order.
 * @param value - the JSON-shaped value to canonicalize and hash.
 * @returns the lowercase SHA-256 digest of the canonical JSON representation.
 */
export function stableJsonHash(value: unknown): string {
  return createHash('sha256').update(stableJson(value)).digest('hex')
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  const record = value as Record<string, unknown>
  return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(',')}}`
}
