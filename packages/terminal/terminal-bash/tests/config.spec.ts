import { describe, expect, it } from 'vitest'
import type { Config } from '@monotykamary/dsh-terminal-bash/src/config.ts'
import { validateConfig } from '@monotykamary/dsh-terminal-bash/src/config.ts'

function config(overrides: Partial<Config> = {}): Config {
  return {
    backendType: 'shell', shellDialect: 'bash', shellPath: '/bin/bash', shellArgs: [], rows: 40, cols: 160,
    scrollbackLines: 100, scrollbackMaxBytes: 1024, interactiveReplayMaxBytes: 768, maxReadBytes: 512,
    pollIntervalMs: 10, exactProbeAfterMs: 20, idleSilenceMs: 100, handoffGraceMs: 50, timeoutMs: 1000,
    disposeGraceMs: 100, unattendedExitMs: 30 * 60_000,
    ...overrides,
  }
}

describe('terminal-bash config', () => {
  it('accepts resolved positive bounds', () => {
    expect(() => { validateConfig(config()) }).not.toThrow()
  })

  it('rejects empty names, invalid numbers, and a read cap above retention', () => {
    expect(() => { validateConfig(config({ backendType: '' })) }).toThrow('backendType')
    expect(() => { validateConfig(config({ shellPath: '' })) }).toThrow('shellPath')
    expect(() => { validateConfig(config({ interactiveShellPath: '' })) }).toThrow('interactiveShellPath')
    expect(() => { validateConfig(config({ rows: 0 })) }).toThrow('rows')
    expect(() => { validateConfig(config({ rows: 1.5 })) }).toThrow('rows')
    expect(() => { validateConfig(config({ maxReadBytes: 2048 })) }).toThrow('must not exceed')
  })

  it('rejects a handoff grace shorter than one readiness poll', () => {
    expect(() => { validateConfig(config({ handoffGraceMs: 9, pollIntervalMs: 10 })) }).toThrow('handoffGraceMs must be at least pollIntervalMs')
    expect(() => { validateConfig(config({ handoffGraceMs: 10, pollIntervalMs: 10 })) }).not.toThrow()
  })

  it('accepts a disabled unattended-exit window and rejects negative or fractional values', () => {
    expect(() => { validateConfig(config({ unattendedExitMs: 0 })) }).not.toThrow()
    expect(() => { validateConfig(config({ unattendedExitMs: -1 })) }).toThrow('unattendedExitMs')
    expect(() => { validateConfig(config({ unattendedExitMs: 1.5 })) }).toThrow('unattendedExitMs')
  })
})
