/** Installation-owned portless CLI resolution and explicit service provisioning. */

import { spawnSync, type SpawnSyncReturns } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Resolve the portless CLI bundled with this Web app package.
 * @returns its absolute JavaScript entry path.
 */
export function portlessCliPath(): string {
  return join(dirname(fileURLToPath(import.meta.resolve('portless'))), 'cli.js')
}

/** Test hook for the child-process boundary; production never mutates it. */
export const internals: {
  spawn: (command: string, args: readonly string[], options: { stdio: 'inherit'; env: NodeJS.ProcessEnv }) => SpawnSyncReturns<Buffer>
} = { spawn: spawnSync }

/**
 * Run the installation-owned portless CLI with inherited interactive stdio.
 * @param args - portless arguments after the executable name.
 * @returns the child exit code, normalized to one for spawn or signal failure.
 */
export function runPortlessCli(args: readonly string[]): number {
  const result = internals.spawn(process.execPath, [portlessCliPath(), ...args], {
    stdio: 'inherit',
    env: process.env,
  })
  if (result.error !== undefined) {
    process.stderr.write(`dsh: could not start the bundled portless CLI: ${result.error.message}\n`)
    return 1
  }
  return result.status ?? 1
}
