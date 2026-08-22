import { existsSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { internals, portlessCliPath, runPortlessCli } from '../src/portless.ts'

const originalSpawn = internals.spawn

afterEach(() => {
  internals.spawn = originalSpawn
  vi.restoreAllMocks()
})

describe('installation-owned portless CLI', () => {
  it('resolves the bundled CLI by absolute package path', () => {
    expect(portlessCliPath()).toMatch(/portless[/\\]dist[/\\]cli\.js$/u)
    expect(existsSync(portlessCliPath())).toBe(true)
  })

  it('runs service setup through the current Node executable', () => {
    const spawn = vi.fn(() => ({ status: 0 } as never))
    internals.spawn = spawn
    expect(runPortlessCli(['service', 'install'])).toBe(0)
    expect(spawn).toHaveBeenCalledWith(process.execPath, [portlessCliPath(), 'service', 'install'], {
      stdio: 'inherit', env: process.env,
    })
  })

  it('normalizes spawn and signal failures', () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true)
    internals.spawn = () => ({ error: new Error('spawn failed') } as never)
    expect(runPortlessCli([])).toBe(1)
    expect(stderr).toHaveBeenCalledWith('dsh: could not start the bundled portless CLI: spawn failed\n')
    internals.spawn = () => ({ status: null } as never)
    expect(runPortlessCli([])).toBe(1)
  })
})
