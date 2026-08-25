/** Shared retry policy for npm registry writes. */

/** Registry result codes that may describe a write that can succeed on retry. */
const TRANSIENT_NPM_WRITE_CODES = [
  'E409', 'E429', 'E500', 'E502', 'E503', 'E504', 'ETIMEDOUT', 'ECONNRESET', 'EAI_AGAIN',
] as const

/** Maximum attempts for one npm registry write. */
export const NPM_WRITE_ATTEMPTS = 4

/** Minimum delay between npm registry writes and the first retry delay. */
export const NPM_WRITE_SPACING_MS = 2_000

/**
 * Decide whether npm reported a registry write that may succeed on retry.
 * @param output - Combined npm standard output and standard error.
 * @returns Whether the output names a transient registry condition.
 */
export function isTransientNpmWriteFailure(output: string): boolean {
  return TRANSIENT_NPM_WRITE_CODES.some(code => output.includes(`code ${code}`))
}
