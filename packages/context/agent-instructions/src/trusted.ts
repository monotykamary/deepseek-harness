/**
 * Trusted user-owned system instructions loaded from the Harness home.
 *
 * @module @monotykamary/dsh-agent-instructions/trusted
 */

import { closeSync, openSync, readSync } from 'node:fs'
import { join } from 'node:path'
import type { ResolvedConfig } from './config.ts'

/** System-prompt section name preserved by complete-prompt adapters. */
export const TRUSTED_SYSTEM_SECTION = 'user:system-instructions'

/** System-prompt order immediately after the deployment persona. */
export const TRUSTED_SYSTEM_ORDER = 1

/** Whether one filesystem error means the optional source is absent. */
function isNotFound(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error
    && (error as { code?: unknown }).code === 'ENOENT'
}

/**
 * Read the trusted system-instruction file without reading beyond its byte cap.
 * Absence contributes no section; malformed UTF-8, oversize content, and I/O
 * failures reject plugin load so partial policy never reaches a request.
 * @param config - normalized Harness home, file name, and byte cap.
 * @returns trimmed instruction text, or an empty string when the file is absent or whitespace-only.
 */
export function loadTrustedSystemInstructions(config: ResolvedConfig): string {
  const path = join(config.dshHome, config.trustedSystemFile)
  let descriptor: number
  try {
    descriptor = openSync(path, 'r')
  } catch (error: unknown) {
    if (isNotFound(error)) return ''
    throw new Error(`agent-instructions: cannot open trusted system file ${JSON.stringify(path)}`, { cause: error })
  }

  const chunks: Buffer[] = []
  let bytes = 0
  try {
    for (;;) {
      const remaining = config.trustedSystemMaxBytes - bytes
      const buffer = Buffer.allocUnsafe(Math.min(8_192, Math.max(1, remaining + 1)))
      const read = readSync(descriptor, buffer, 0, buffer.length, null)
      if (read === 0) break
      chunks.push(buffer.subarray(0, read))
      bytes += read
      if (bytes > config.trustedSystemMaxBytes) {
        throw new Error(
          `agent-instructions: trusted system file ${JSON.stringify(path)} exceeds trustedSystemMaxBytes (${config.trustedSystemMaxBytes})`,
        )
      }
    }
  } finally {
    closeSync(descriptor)
  }

  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks, bytes)).trim()
  } catch (error: unknown) {
    throw new Error(`agent-instructions: trusted system file ${JSON.stringify(path)} is not valid UTF-8`, { cause: error })
  }
}
