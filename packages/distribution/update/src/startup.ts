/** Detached distribution update worker. */

import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { writeFileAtomic } from '@monotykamary/dsh-atomic-write'
import type { InstallChannel } from './types.ts'

interface WorkerStatus {
  state: 'running' | 'succeeded' | 'failed'
  startedAt: number
  finishedAt?: number
  exitCode?: number | null
  error?: string
}

interface WorkerCommand {
  executable: string
  args: string[]
  cwd?: string
}

async function writeStatus(path: string, status: WorkerStatus): Promise<void> {
  await writeFileAtomic(path, `${JSON.stringify(status, undefined, 2)}\n`, { mode: 0o600, dirMode: 0o700 })
}

function commands(channel: InstallChannel, target: string): WorkerCommand[] {
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
  switch (channel) {
    case 'npm-global': return [{ executable: npm, args: ['install', '--global', `${target}@latest`] }]
    case 'source': return [
      { executable: 'git', args: ['pull', '--ff-only'], cwd: target },
      { executable: pnpm, args: ['install'], cwd: target },
      { executable: pnpm, args: ['run', 'build'], cwd: target },
    ]
    case 'npx':
    case 'nix':
    case 'unknown': throw new Error(`distribution-update: ${channel} has no automatic worker`)
    default: channel satisfies never; throw new Error('distribution-update: unsupported install channel')
  }
}

async function run(command: WorkerCommand): Promise<number | null> {
  const child = spawn(command.executable, command.args, {
    cwd: command.cwd,
    stdio: 'ignore',
    env: {
      ...Object.fromEntries(Object.entries(process.env).filter(([key, value]) => value !== undefined
        && !/(?:KEY|SECRET|TOKEN|PASSWORD)/iu.test(key))),
      ...command.executable === 'git' ? { GIT_TERMINAL_PROMPT: '0' } : {},
    },
    shell: process.platform === 'win32',
  })
  return await new Promise<number | null>((resolve, reject) => {
    child.once('error', reject)
    child.once('exit', resolve)
  })
}

/**
 * Apply an update outside the live harness and persist its independent outcome.
 * @param statusPath - owner-only JSON status destination.
 * @param channel - supported automatic installation channel.
 * @param target - npm package name or source repository root.
 * @returns the first failing exit code, normalized to one on spawn failure or signal exit.
 */
export async function runUpdateWorker(statusPath: string, channel: InstallChannel, target: string): Promise<number> {
  const startedAt = Date.now()
  await writeStatus(statusPath, { state: 'running', startedAt })
  try {
    for (const command of commands(channel, target)) {
      const exitCode = await run(command)
      if (exitCode !== 0) {
        await writeStatus(statusPath, { state: 'failed', startedAt, finishedAt: Date.now(), exitCode })
        return exitCode ?? 1
      }
    }
    await writeStatus(statusPath, { state: 'succeeded', startedAt, finishedAt: Date.now(), exitCode: 0 })
    return 0
  } catch (error) {
    await writeStatus(statusPath, {
      state: 'failed', startedAt, finishedAt: Date.now(), error: error instanceof Error ? error.message : String(error),
    })
    return 1
  }
}

/* v8 ignore start -- exercised by the built worker process; coverage cannot cross the process boundary. */
if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [statusPath, channel, target] = process.argv.slice(2)
  if (statusPath === undefined || target === undefined
    || (channel !== 'npm-global' && channel !== 'source')) {
    throw new Error('usage: startup.js <status-path> <npm-global|source> <target>')
  }
  process.exitCode = await runUpdateWorker(statusPath, channel, target)
}
/* v8 ignore stop */
