/** Detached npm-global update worker. */

import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { writeFileAtomic } from '@monotykamary/dsh-atomic-write'

interface WorkerStatus {
  state: 'running' | 'succeeded' | 'failed'
  startedAt: number
  finishedAt?: number
  exitCode?: number | null
  error?: string
}

async function writeStatus(path: string, status: WorkerStatus): Promise<void> {
  await writeFileAtomic(path, `${JSON.stringify(status, undefined, 2)}\n`, { mode: 0o600, dirMode: 0o700 })
}

/**
 * Run npm outside the live harness and persist its independent outcome.
 * @param statusPath - owner-only JSON status destination.
 * @param packageName - app package to install from its latest tag.
 * @returns npm's exit code, normalized to one on spawn failure or signal exit.
 */
export async function runUpdateWorker(statusPath: string, packageName: string): Promise<number> {
  const startedAt = Date.now()
  await writeStatus(statusPath, { state: 'running', startedAt })
  const executable = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  try {
    const child = spawn(executable, ['install', '--global', `${packageName}@latest`], {
      stdio: 'ignore',
      env: Object.fromEntries(Object.entries(process.env).filter(([key, value]) => value !== undefined
        && !/(?:KEY|SECRET|TOKEN|PASSWORD)/iu.test(key))),
      shell: process.platform === 'win32',
    })
    const exitCode = await new Promise<number | null>((resolve, reject) => {
      child.once('error', reject)
      child.once('exit', resolve)
    })
    const state = exitCode === 0 ? 'succeeded' : 'failed'
    await writeStatus(statusPath, { state, startedAt, finishedAt: Date.now(), exitCode })
    return exitCode ?? 1
  } catch (error) {
    await writeStatus(statusPath, {
      state: 'failed', startedAt, finishedAt: Date.now(), error: error instanceof Error ? error.message : String(error),
    })
    return 1
  }
}

/* v8 ignore start -- exercised by the built worker process; coverage cannot cross the process boundary. */
if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [statusPath, packageName] = process.argv.slice(2)
  if (statusPath === undefined || packageName === undefined) {
    throw new Error('usage: startup.js <status-path> <package-name>')
  }
  process.exitCode = await runUpdateWorker(statusPath, packageName)
}
/* v8 ignore stop */
