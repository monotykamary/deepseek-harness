/**
 * Surface resolution behavior over injected exec/probe seams: tailscale serve
 * matching (canonical 443 Web handler and TCP HTTPS listeners), portless alias
 * + proxy liveness, and the warning paths for absent tooling.
 */

import { describe, expect, it } from 'vitest'
import {
  resolveRemoteSurfaces,
  type SurfaceProbeOptions,
} from '../src/surfaces.ts'
import { portlessCliPath } from '../src/portless.ts'

/** A scriptable exec seam: one queued outcome per call, or a shared responder. */
function execScript(
  outcomes: (Error | { stdout: string; stderr: string })[],
): { exec: NonNullable<SurfaceProbeOptions['exec']>; calls: string[][] } {
  const calls: string[][] = []
  const exec: NonNullable<SurfaceProbeOptions['exec']> = async (file, args) => {
    calls.push([file, ...args])
    const outcome = outcomes.shift()
    if (outcome === undefined) throw new Error('unexpected exec call')
    if (outcome instanceof Error) throw outcome
    return outcome
  }
  return { exec, calls }
}

const enoent = (): Error => {
  const error = new Error('spawn ENOENT') as NodeJS.ErrnoException
  error.code = 'ENOENT'
  return error
}

const SELF_ONLINE = JSON.stringify({ Self: { DNSName: 'node.tail.ts.net.', Online: true } })

describe('resolveRemoteSurfaces', () => {
  it('settles at once with no probes when both flags are off', async () => {
    const { exec, calls } = execScript([])
    const resolution = await resolveRemoteSurfaces(4567, false, false, { exec })
    expect(resolution).toEqual({ warnings: [] })
    expect(calls).toEqual([])
  })

  it('resolves the canonical 443 Web handler front', async () => {
    const { exec, calls } = execScript([
      {
        stdout: JSON.stringify({
          Web: { 'node.tail.ts.net:443': { Handlers: { '/': { Proxy: 'http://localhost:4567' } } } },
        }),
        stderr: '',
      },
      { stdout: SELF_ONLINE, stderr: '' },
    ])
    const resolution = await resolveRemoteSurfaces(4567, true, false, { exec })
    expect(resolution).toEqual({
      tailnet: { url: 'https://node.tail.ts.net', authority: 'node.tail.ts.net' },
      warnings: [],
    })
    expect(calls).toEqual([
      ['tailscale', 'serve', 'status', '--json'],
      ['tailscale', 'status', '--json'],
    ])
  })

  it('resolves a TCP HTTPS listener on the bound port', async () => {
    const { exec } = execScript([
      {
        stdout: JSON.stringify({
          TCP: { 'node.tail.ts.net:3080': { HTTPS: true } },
        }),
        stderr: '',
      },
      { stdout: SELF_ONLINE, stderr: '' },
    ])
    const resolution = await resolveRemoteSurfaces(3080, true, false, { exec })
    expect(resolution).toEqual({
      tailnet: { url: 'https://node.tail.ts.net:3080', authority: 'node.tail.ts.net' },
      warnings: [],
    })
  })

  it('prefers the HTTPS listener fronting the bound port over lower ports', async () => {
    const { exec } = execScript([
      {
        stdout: JSON.stringify({
          TCP: {
            'node.tail.ts.net:8080': { HTTPS: true },
            'node.tail.ts.net:4567': { HTTPS: true },
          },
        }),
        stderr: '',
      },
      { stdout: SELF_ONLINE, stderr: '' },
    ])
    const resolution = await resolveRemoteSurfaces(4567, true, false, { exec })
    expect(resolution.tailnet?.url).toBe('https://node.tail.ts.net:4567')
  })

  it('ignores plain TCP forwards and other hosts among HTTPS listeners', async () => {
    const { exec } = execScript([
      {
        stdout: JSON.stringify({
          TCP: {
            'node.tail.ts.net:3080': { HTTPS: false },
            'someone-else.ts.net:3080': { HTTPS: true },
          },
        }),
        stderr: '',
      },
      { stdout: SELF_ONLINE, stderr: '' },
    ])
    const resolution = await resolveRemoteSurfaces(3080, true, false, { exec })
    expect(resolution.tailnet).toBeUndefined()
    expect(resolution.warnings).toHaveLength(1)
    expect(resolution.warnings[0]).toContain('does not front port 3080')
  })

  it('warns instead of failing when tailscale is not installed', async () => {
    const { exec } = execScript([enoent()])
    const resolution = await resolveRemoteSurfaces(4567, true, false, { exec })
    expect(resolution.tailnet).toBeUndefined()
    expect(resolution.warnings).toEqual(['tailscale not installed — install from https://tailscale.com/download'])
  })

  it('warns when the node is offline', async () => {
    const { exec } = execScript([
      { stdout: '{}', stderr: '' },
      { stdout: JSON.stringify({ Self: { DNSName: 'node.tail.ts.net.', Online: false } }), stderr: '' },
    ])
    const resolution = await resolveRemoteSurfaces(4567, true, false, { exec })
    expect(resolution.tailnet).toBeUndefined()
    expect(resolution.warnings).toEqual(['tailscale offline — run `tailscale up` before using the tailnet surface'])
  })

  it('settles unexpected probe failures as warnings', async () => {
    const { exec } = execScript([new Error('timeout')])
    const resolution = await resolveRemoteSurfaces(4567, true, false, { exec })
    expect(resolution.tailnet).toBeUndefined()
    expect(resolution.warnings).toEqual(['tailscale serve status failed: timeout'])
  })

  it('resolves the portless surface when the alias registers and the proxy is live', async () => {
    const { exec, calls } = execScript([{ stdout: '', stderr: '' }])
    const resolution = await resolveRemoteSurfaces(4567, false, true, {
      exec,
      probe: async (host, port) => host === '127.0.0.1' && port === 443,
    })
    expect(resolution).toEqual({
      portless: { url: 'https://dsh.localhost', authority: 'dsh.localhost' },
      warnings: [],
    })
    expect(calls).toEqual([[process.execPath, portlessCliPath(), 'alias', 'dsh', '4567', '--force']])
  })

  it('accepts the proxy on either loopback family', async () => {
    const { exec } = execScript([{ stdout: '', stderr: '' }])
    const resolution = await resolveRemoteSurfaces(4567, false, true, {
      exec,
      probe: async host => host === '::1',
    })
    expect(resolution.portless?.url).toBe('https://dsh.localhost')
  })

  it('warns when the alias registers but the proxy is not serving :443', async () => {
    const { exec } = execScript([{ stdout: '', stderr: '' }])
    const resolution = await resolveRemoteSurfaces(4567, false, true, {
      exec,
      probe: async () => false,
    })
    expect(resolution.portless).toBeUndefined()
    expect(resolution.warnings).toEqual(['portless proxy not running on :443 — run `dsh portless setup` for named localhost URLs'])
  })

  it('warns when the bundled portless CLI cannot start', async () => {
    const { exec } = execScript([enoent()])
    const resolution = await resolveRemoteSurfaces(4567, false, true, { exec })
    expect(resolution.portless).toBeUndefined()
    expect(resolution.warnings).toEqual(['bundled portless CLI is unavailable — reinstall DSH, then run `dsh portless setup`'])
  })

  it('resolves both enabled surfaces in one call', async () => {
    // Parallel probes interleave, so the seam routes by invocation instead
    // of consuming one shared outcome queue.
    const calls: string[][] = []
    const exec: NonNullable<SurfaceProbeOptions['exec']> = async (file, args) => {
      calls.push([file, ...args])
      if (file === 'tailscale' && args[0] === 'serve') {
        return {
          stdout: JSON.stringify({
            Web: { 'node.tail.ts.net:443': { Handlers: { '/': { Proxy: 'http://localhost:4567' } } } },
          }),
          stderr: '',
        }
      }
      if (file === 'tailscale') return { stdout: SELF_ONLINE, stderr: '' }
      return { stdout: '', stderr: '' }
    }
    const resolution = await resolveRemoteSurfaces(4567, true, true, {
      exec,
      probe: async () => true,
    })
    expect(resolution.tailnet?.url).toBe('https://node.tail.ts.net')
    expect(resolution.portless?.url).toBe('https://dsh.localhost')
    expect(resolution.warnings).toEqual([])
    expect(calls).toHaveLength(3)
  })
})
