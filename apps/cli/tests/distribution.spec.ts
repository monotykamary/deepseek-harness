import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { runDistribution } from '../src/distribution.ts'

function manifest(): string {
  const root = mkdtempSync(join(tmpdir(), 'dsh-cli-distribution-'))
  mkdirSync(join(root, 'node_modules', 'dsh-fabric'), { recursive: true })
  mkdirSync(join(root, 'node_modules', 'dsh-fovea'), { recursive: true })
  mkdirSync(join(root, 'node_modules', 'dsh-factory'), { recursive: true })
  writeFileSync(join(root, 'package.json'), JSON.stringify({
    name: '@monotykamary/dsh', version: '1.0.0', dependencies: { 'dsh-fabric': '2.0.0', 'dsh-fovea': '3.0.0', 'dsh-factory': '4.0.0' },
  }))
  writeFileSync(join(root, 'node_modules', 'dsh-fabric', 'package.json'), JSON.stringify({ version: '2.0.0' }))
  writeFileSync(join(root, 'node_modules', 'dsh-fovea', 'package.json'), JSON.stringify({ version: '3.0.0' }))
  writeFileSync(join(root, 'node_modules', 'dsh-factory', 'package.json'), JSON.stringify({ version: '4.0.0' }))
  return join(root, 'package.json')
}

afterEach(() => {
  vi.restoreAllMocks()
  delete process.env.DSH_INSTALL_CHANNEL
})

describe('distribution CLI', () => {
  it('prints human and JSON inventory', async () => {
    process.env.DSH_INSTALL_CHANNEL = 'source'
    const output = vi.spyOn(process.stdout, 'write').mockReturnValue(true)
    expect(await runDistribution('version', false, manifest(), () => [])).toBe(0)
    expect(output.mock.calls.flat().join('')).toContain('@monotykamary/dsh: 1.0.0')
    output.mockClear()
    expect(await runDistribution('doctor', true, manifest(), () => [])).toBe(0)
    expect(JSON.parse(String(output.mock.calls[0]?.[0]))).toMatchObject({ channel: 'source', node: process.version, diagnostics: [] })
    output.mockClear()
    expect(await runDistribution('doctor', false, manifest(), () => [{
      id: 'shell', severity: 'blocking', summary: 'Bash is unavailable.', remediation: 'Install Bash.',
    }])).toBe(2)
    expect(output.mock.calls.flat().join('')).toContain('[blocking] Bash is unavailable.\n  Install Bash.')
  })

  it('reports available updates and registry failures with distinct exit codes', async () => {
    process.env.DSH_INSTALL_CHANNEL = 'source'
    vi.spyOn(process.stdout, 'write').mockReturnValue(true)
    vi.spyOn(process.stderr, 'write').mockReturnValue(true)
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      version: '9.0.0', dependencies: { 'dsh-fabric': '9.0.0', 'dsh-fovea': '9.0.0', 'dsh-factory': '9.0.0' },
    }))))
    expect(await runDistribution('check', false, manifest())).toBe(10)
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    expect(await runDistribution('check', true, manifest())).toBe(1)
  })

  it('returns channel guidance when this process cannot self-update', async () => {
    process.env.DSH_INSTALL_CHANNEL = 'npx'
    const output = vi.spyOn(process.stdout, 'write').mockReturnValue(true)
    expect(await runDistribution('update', false, manifest())).toBe(2)
    expect(output).toHaveBeenCalledWith('npx @monotykamary/dsh@latest web\n')
  })
})
