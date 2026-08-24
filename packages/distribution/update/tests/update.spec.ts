import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { EventEmitter } from 'node:events'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@monotykamary/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'

interface SpawnCallOptions { detached?: boolean; env?: NodeJS.ProcessEnv; shell?: boolean }
const spawnMock = vi.hoisted(() => vi.fn<(command: string, args: readonly string[], options: SpawnCallOptions) => unknown>())
const spawnSyncMock = vi.hoisted(() => vi.fn(() => ({ status: 0 })))
vi.mock('node:child_process', () => ({ spawn: spawnMock, spawnSync: spawnSyncMock }))
import {
  checkInstalledDistribution, detectInstallChannel, DistributionUpdateService, internals,
  installedDistribution, installationDiagnostics, launchDetachedUpdate,
} from '../src/index.ts'
import { runUpdateWorker } from '../src/startup.ts'

function fixture(): { root: string; manifest: string } {
  const root = mkdtempSync(join(tmpdir(), 'dsh-distribution-'))
  const app = join(root, 'app')
  mkdirSync(join(root, '.git'))
  writeFileSync(join(root, 'pnpm-workspace.yaml'), 'packages: []\n')
  mkdirSync(join(app, 'node_modules', 'dsh-tool-repair'), { recursive: true })
  mkdirSync(join(app, 'node_modules', 'dsh-fabric'), { recursive: true })
  mkdirSync(join(app, 'node_modules', 'dsh-fovea'), { recursive: true })
  mkdirSync(join(app, 'node_modules', 'dsh-factory'), { recursive: true })
  const manifest = join(app, 'package.json')
  writeFileSync(manifest, JSON.stringify({
    name: '@monotykamary/dsh', version: '1.2.3', dependencies: { 'dsh-tool-repair': '3.4.5', 'dsh-fabric': '4.5.6', 'dsh-fovea': '7.8.9', 'dsh-factory': '8.9.0' },
  }))
  writeFileSync(join(app, 'node_modules', 'dsh-tool-repair', 'package.json'), JSON.stringify({ name: 'dsh-tool-repair', version: '3.4.5' }))
  writeFileSync(join(app, 'node_modules', 'dsh-fabric', 'package.json'), JSON.stringify({ name: 'dsh-fabric', version: '4.5.6' }))
  writeFileSync(join(app, 'node_modules', 'dsh-fovea', 'package.json'), JSON.stringify({ name: 'dsh-fovea', version: '7.8.9' }))
  writeFileSync(join(app, 'node_modules', 'dsh-factory', 'package.json'), JSON.stringify({ name: 'dsh-factory', version: '8.9.0' }))
  return { root, manifest }
}

afterEach(() => {
  vi.restoreAllMocks()
  spawnMock.mockReset()
  spawnSyncMock.mockClear()
  internals.diagnose = installationDiagnostics
  delete process.env.DSH_INSTALL_CHANNEL
})

describe('distribution inventory', () => {
  it('reads the app closure and detects every supported channel', () => {
    const { manifest } = fixture()
    expect(installedDistribution(manifest).map(pkg => `${pkg.name}@${pkg.installed}`)).toEqual([
      '@monotykamary/dsh@1.2.3', 'dsh-tool-repair@3.4.5', 'dsh-fabric@4.5.6', 'dsh-fovea@7.8.9', 'dsh-factory@8.9.0',
    ])
    expect(detectInstallChannel('/work/apps/cli/package.json')).toBe('source')
    expect(detectInstallChannel('/tmp/_npx/x/package.json')).toBe('npx')
    expect(detectInstallChannel('/tmp/pnpm/dlx/x/package.json')).toBe('npx')
    expect(detectInstallChannel('/nix/store/x/package.json')).toBe('nix')
    expect(detectInstallChannel('/usr/lib/node_modules/x/package.json')).toBe('npm-global')
    expect(detectInstallChannel('C:\\Users\\u\\AppData\\Roaming\\npm\\node_modules\\x\\package.json')).toBe('npm-global')
    expect(detectInstallChannel('/opt/x/package.json')).toBe('unknown')
    expect(detectInstallChannel('/opt/x/package.json', 'nix')).toBe('nix')
  })


  it('rejects invalid app and companion manifests and tolerates an app-only closure', () => {
    const { root, manifest } = fixture()
    writeFileSync(manifest, JSON.stringify({ name: '@monotykamary/dsh', version: '1.2.3' }))
    expect(installedDistribution(manifest)).toHaveLength(1)
    writeFileSync(manifest, JSON.stringify({ name: '@monotykamary/dsh', version: '1.2.3', dependencies: {} }))
    expect(installedDistribution(manifest)).toHaveLength(1)
    writeFileSync(manifest, JSON.stringify({ name: 1, version: '1.2.3' }))
    expect(() => installedDistribution(manifest)).toThrow('invalid app manifest')
    writeFileSync(manifest, JSON.stringify({
      name: '@monotykamary/dsh', version: '1.2.3', dependencies: { 'dsh-fabric': '4.5.6' },
    }))
    writeFileSync(join(root, 'app', 'node_modules', 'dsh-fabric', 'package.json'), '{}')
    expect(() => installedDistribution(manifest)).toThrow('declares no version')
  })

  it('reports actionable shell, sandbox, home, and desktop readiness', () => {
    const ready = installationDiagnostics({
      platform: 'linux',
      env: { DISPLAY: ':0' },
      dshHome: '/private/dsh',
      writable: () => true,
      run: command => command === 'bash',
      landlock: () => 'full',
    })
    expect(ready).toEqual([
      { id: 'dsh-home', severity: 'ok', summary: 'DSH home is writable: /private/dsh', remediation: null },
      { id: 'shell', severity: 'ok', summary: 'Bash is available.', remediation: null },
      { id: 'sandbox', severity: 'ok', summary: 'Installation-owned Landlock sandbox is available.', remediation: null },
      { id: 'desktop', severity: 'ok', summary: 'Desktop handoff is available.', remediation: null },
    ])
    const blocked = installationDiagnostics({
      platform: 'linux', env: {}, dshHome: '/locked/dsh', writable: () => false,
      run: () => false, landlock: () => 'unusable',
    })
    expect(blocked.map(item => [item.id, item.severity])).toEqual([
      ['dsh-home', 'blocking'], ['shell', 'blocking'], ['sandbox', 'blocking'], ['desktop', 'warning'],
    ])
    expect(blocked.find(item => item.id === 'sandbox')?.remediation).toContain('bubblewrap')
  })

  it('uses default command and writable-ancestor probes', () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-diagnostics-'))
    expect(installationDiagnostics({ dshHome: join(root, 'future', 'home') }))
      .toEqual(expect.arrayContaining([expect.objectContaining({ id: 'dsh-home', severity: 'ok' })]))
    const file = join(root, 'not-a-directory')
    writeFileSync(file, 'x')
    expect(installationDiagnostics({ dshHome: file, run: () => true }))
      .toEqual(expect.arrayContaining([expect.objectContaining({ id: 'dsh-home', severity: 'blocking' })]))
    const locked = join(root, 'locked')
    mkdirSync(locked)
    chmodSync(locked, 0o000)
    try {
      expect(installationDiagnostics({ dshHome: locked, run: () => true }))
        .toEqual(expect.arrayContaining([expect.objectContaining({ id: 'dsh-home', severity: 'blocking' })]))
    } finally {
      chmodSync(locked, 0o700)
    }
    expect(installationDiagnostics({ platform: 'linux', dshHome: root, writable: () => true, run: command => command === 'bash' }))
      .toEqual(expect.arrayContaining([expect.objectContaining({ id: 'sandbox' })]))
  })

  it('reports platform-specific PowerShell, Seatbelt, and unsupported-host readiness', () => {
    expect(installationDiagnostics({ platform: 'win32', dshHome: 'C:\\dsh', writable: () => true, run: command => command === 'powershell.exe' }))
      .toEqual(expect.arrayContaining([expect.objectContaining({ id: 'shell', severity: 'ok' }), expect.objectContaining({ id: 'sandbox', severity: 'ok' })]))
    const windowsBlocked = installationDiagnostics({
      platform: 'win32', dshHome: 'C:\\dsh', writable: () => true, run: () => false,
    })
    expect(windowsBlocked.find(item => item.id === 'shell')).toMatchObject({ severity: 'blocking' })
    expect(windowsBlocked.find(item => item.id === 'shell')?.remediation).toContain('PowerShell')
    expect(installationDiagnostics({ platform: 'darwin', dshHome: '/dsh', writable: () => true, run: command => command !== 'sandbox-exec' }))
      .toEqual(expect.arrayContaining([expect.objectContaining({ id: 'sandbox', severity: 'blocking' })]))
    expect(installationDiagnostics({ platform: 'darwin', dshHome: '/dsh', writable: () => true, run: () => true }))
      .toEqual(expect.arrayContaining([expect.objectContaining({ id: 'sandbox', severity: 'ok' })]))
    expect(installationDiagnostics({ platform: 'freebsd', dshHome: '/dsh', writable: () => true, run: () => true }))
      .toEqual(expect.arrayContaining([expect.objectContaining({ id: 'sandbox', severity: 'blocking' })]))
    expect(installationDiagnostics({ platform: 'linux', dshHome: '/dsh', writable: () => true, run: command => command === 'bash' || command === 'bwrap', landlock: () => { throw new Error('unused') } }))
      .toEqual(expect.arrayContaining([expect.objectContaining({ id: 'sandbox', summary: 'Bubblewrap sandbox is available.' })]))
    const partial = installationDiagnostics({
      platform: 'linux', dshHome: '/dsh', writable: () => true,
      run: command => command === 'bash', landlock: () => 'partial',
    })
    expect(partial.find(item => item.id === 'sandbox')?.summary).toContain('partial')
  })

  it('never treats an older release or a satisfied dependency range as an update', async () => {
    const { manifest } = fixture()
    writeFileSync(manifest, JSON.stringify({
      name: '@monotykamary/dsh', version: '0.1.0-rc.11',
      dependencies: { 'dsh-tool-repair': '3.4.5', 'dsh-fabric': '4.5.6', 'dsh-fovea': '7.8.9', 'dsh-factory': '8.9.0' },
    }))
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      version: '0.1.0-rc.8', dependencies: { 'dsh-tool-repair': '^3.4.0', 'dsh-fabric': '^4.5.0', 'dsh-fovea': '^7.8.0', 'dsh-factory': '^8.9.0' },
    }))))
    const packages = await checkInstalledDistribution(manifest)
    expect(packages.map(pkg => pkg.updateAvailable)).toEqual([false, false, false, false, false])
  })

  it('checks latest tags and rejects malformed registry responses', async () => {
    const { manifest } = fixture()
    const fetch = vi.fn(async () => new Response(JSON.stringify({
      version: '1.2.3', dependencies: { 'dsh-tool-repair': '3.4.5', 'dsh-fabric': '4.5.6', 'dsh-fovea': '7.8.10', 'dsh-factory': '8.9.0' },
    })))
    vi.stubGlobal('fetch', fetch)
    const packages = await checkInstalledDistribution(manifest, 'https://registry.example/', 500)
    expect(packages.map(pkg => pkg.updateAvailable)).toEqual([false, false, false, true, false])
    expect(fetch).toHaveBeenCalledOnce()
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}')))
    await expect(checkInstalledDistribution(manifest)).rejects.toThrow('registry response has no version')
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 503 })))
    await expect(checkInstalledDistribution(manifest)).rejects.toThrow('HTTP 503')
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ version: '2.0.0', dependencies: {} }))))
    await expect(checkInstalledDistribution(manifest)).rejects.toThrow('no tested version for dsh-tool-repair')
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ version: '2.0.0', dependencies: null }))))
    await expect(checkInstalledDistribution(manifest)).rejects.toThrow('no tested version for dsh-tool-repair')

    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => { reject(new Error('aborted')) })
    })))
    const timed = checkInstalledDistribution(manifest, 'https://registry.example', 10)
    const refusal = expect(timed).rejects.toThrow('aborted')
    await vi.advanceTimersByTimeAsync(10)
    await refusal
    vi.useRealTimers()
  })

  it('logs non-ready startup diagnostics and returns immutable copies', async () => {
    const { manifest } = fixture()
    internals.diagnose = () => [{
      id: 'shell', severity: 'blocking', summary: 'Bash is unavailable.', remediation: 'Install Bash.',
    }, {
      id: 'desktop', severity: 'warning', summary: 'No desktop.', remediation: null,
    }]
    const ctx = new Context()
    const warn = vi.spyOn(ctx.logger, 'warn').mockImplementation(() => {})
    const service = new DistributionUpdateService(ctx, { appManifest: manifest, checkOnStartup: false })
    expect(warn).toHaveBeenCalledWith('[blocking] Bash is unavailable. Install Bash.')
    expect(warn).toHaveBeenCalledWith('[warning] No desktop.')
    const first = service.snapshot()
    const second = service.snapshot()
    expect(first.diagnostics).toEqual(second.diagnostics)
    expect(first.diagnostics).not.toBe(second.diagnostics)
    await ctx.fiber.dispose()
  })

  it('caches Remote status, folds concurrent checks, and reports channel guidance', async () => {
    const { manifest } = fixture()
    let release: (() => void) | undefined
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((resolve) => {
      release = () => { resolve(new Response(JSON.stringify({
        version: '9.0.0', dependencies: { 'dsh-tool-repair': '9.0.0', 'dsh-fabric': '9.0.0', 'dsh-fovea': '9.0.0', 'dsh-factory': '9.0.0' },
      }))) }
    })))
    process.env.DSH_INSTALL_CHANNEL = 'source'
    const ctx = new Context()
    const service = new DistributionUpdateService(ctx, {
      appManifest: manifest, checkOnStartup: false, checkIntervalMs: 60_000, requestTimeoutMs: 500,
    })
    expect(service.snapshot()).toMatchObject({ checking: false, checkedAt: null, channel: 'source' })
    const first = service.check()
    expect(service.check()).toBe(first)
    expect(service.snapshot().checking).toBe(true)
    release?.()
    const result = await first
    expect(result).toMatchObject({ checking: false, updateAvailable: true, error: null })
    spawnMock.mockReturnValue(childProcess(0))
    const launch = service.start()
    expect(launch.started).toBe(true)
    expect(typeof launch.statusPath).toBe('string')
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    expect(await service.check()).toMatchObject({ error: 'offline', updateAvailable: true })
    await ctx.fiber.dispose()
  })

  it('returns guidance for every externally managed channel', () => {
    const { manifest } = fixture()
    for (const [channel, message] of [
      ['nix', 'nix flake update'],
      ['npx', 'npx @monotykamary/dsh@latest web'],
      ['unknown', 'This installation channel must be updated by its package manager.'],
    ] as const) {
      process.env.DSH_INSTALL_CHANNEL = channel
      expect(launchDetachedUpdate(manifest)).toEqual({ started: false, message, statusPath: null })
    }
  })

  it('applies defaults, checks on startup and interval, and normalizes a non-Error failure', async () => {
    const { manifest } = fixture()
    process.env.DSH_INSTALL_CHANNEL = 'source'
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      version: '1.2.3', dependencies: { 'dsh-tool-repair': '3.4.5', 'dsh-fabric': '4.5.6', 'dsh-fovea': '7.8.9', 'dsh-factory': '8.9.0' },
    }))))
    const ctx = new Context()
    const service = new DistributionUpdateService(ctx, { appManifest: manifest })
    await vi.waitFor(() => { expect(service.snapshot().checkedAt).not.toBeNull() })
    vi.stubGlobal('fetch', vi.fn(async () => { throw 'offline' }))
    expect(await service.check()).toMatchObject({ error: 'offline' })
    await ctx.fiber.dispose()
  })

  it('checks again on the configured background interval', async () => {
    const { manifest } = fixture()
    process.env.DSH_INSTALL_CHANNEL = 'source'
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      version: '1.2.3', dependencies: { 'dsh-tool-repair': '3.4.5', 'dsh-fabric': '4.5.6', 'dsh-fovea': '7.8.9', 'dsh-factory': '8.9.0' },
    }))))
    const ctx = new Context()
    const service = new DistributionUpdateService(ctx, {
      appManifest: manifest, checkOnStartup: false, checkIntervalMs: 60_000,
    })
    await vi.advanceTimersByTimeAsync(60_000)
    await Promise.resolve()
    expect(service.snapshot().checkedAt).not.toBeNull()
    await ctx.fiber.dispose()
    vi.useRealTimers()
  })
})

function childProcess(outcome: number | null | Error | string): EventEmitter & { unref: ReturnType<typeof vi.fn> } {
  const child = Object.assign(new EventEmitter(), { unref: vi.fn() })
  let scheduled = false
  const once = child.once.bind(child)
  child.once = ((event: string, listener: (...args: unknown[]) => void) => {
    once(event, listener)
    if (!scheduled) {
      scheduled = true
      queueMicrotask(() => {
        if (outcome instanceof Error || typeof outcome === 'string') child.emit('error', outcome)
        else child.emit('exit', outcome)
      })
    }
    return child
  }) as typeof child.once
  return child
}

describe('detached launch and worker', () => {
  it('launches npm-global and source updates detached with a scrubbed environment', () => {
    const { root, manifest } = fixture()
    process.env.DSH_INSTALL_CHANNEL = 'npm-global'
    process.env.DSH_TEST_SECRET = 'remove-me'
    spawnMock.mockReturnValue(childProcess(0))
    const result = launchDetachedUpdate(manifest)
    expect(result.started).toBe(true)
    expect(result.message).toContain('Restart DSH')
    const options = spawnMock.mock.calls[0]?.[2]
    if (options?.env === undefined) throw new Error('detached launch omitted spawn environment')
    expect(options.detached).toBe(true)
    expect(options.env.DSH_TEST_SECRET).toBeUndefined()
    process.env.DSH_INSTALL_CHANNEL = 'source'
    const sourceLaunch = launchDetachedUpdate(manifest)
    expect(sourceLaunch.started).toBe(true)
    expect(typeof sourceLaunch.statusPath).toBe('string')
    const sourceArgs = spawnMock.mock.calls[1]?.[1]
    expect(sourceArgs?.includes('source')).toBe(true)
    expect(sourceArgs?.includes(root)).toBe(true)
    delete process.env.DSH_TEST_SECRET
  })

  it('runs source pull, install, and build sequentially in the repository root', async () => {
    const { root } = fixture()
    spawnMock.mockReturnValueOnce(childProcess(0)).mockReturnValueOnce(childProcess(0)).mockReturnValueOnce(childProcess(0))
    const status = join(root, 'private', 'status.json')
    expect(await runUpdateWorker(status, 'source', root)).toBe(0)
    expect((spawnMock.mock.calls[0]?.[2] as { env?: NodeJS.ProcessEnv }).env?.GIT_TERMINAL_PROMPT).toBe('0')
    expect(spawnMock.mock.calls.map(([executable, args, options]) => ({
      executable, args, cwd: (options as { cwd?: string }).cwd,
    }))).toEqual([
      { executable: 'git', args: ['pull', '--ff-only'], cwd: root },
      { executable: 'pnpm', args: ['install'], cwd: root },
      { executable: 'pnpm', args: ['run', 'build'], cwd: root },
    ])
  })

  it('stops a source update at the first failing command', async () => {
    const { root } = fixture()
    spawnMock.mockReturnValueOnce(childProcess(0)).mockReturnValueOnce(childProcess(7))
    const status = join(root, 'private', 'status.json')
    expect(await runUpdateWorker(status, 'source', root)).toBe(7)
    expect(spawnMock).toHaveBeenCalledTimes(2)
    expect(JSON.parse(readFileSync(status, 'utf8'))).toMatchObject({ state: 'failed', exitCode: 7 })
  })

  it('uses the npm command shim on Windows', async () => {
    const { root } = fixture()
    vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')
    spawnMock.mockReturnValue(childProcess(0))
    const status = join(root, 'private', 'status.json')
    expect(await runUpdateWorker(status, 'npm-global', '@monotykamary/dsh')).toBe(0)
    expect(spawnMock.mock.calls[0]?.[0]).toBe('npm.cmd')
    expect((spawnMock.mock.calls[0]?.[2] as { shell: boolean }).shell).toBe(true)
  })

  it.each([
    [0, 'succeeded', 0],
    [7, 'failed', 7],
    [null, 'failed', 1],
  ] as const)('records worker exit %s as %s', async (exit, state, returned) => {
    const { root } = fixture()
    spawnMock.mockReturnValue(childProcess(exit))
    const status = join(root, 'private', 'status.json')
    expect(await runUpdateWorker(status, 'npm-global', '@monotykamary/dsh')).toBe(returned)
    expect(JSON.parse(readFileSync(status, 'utf8'))).toMatchObject({ state, exitCode: exit })
  })

  it.each([new Error('npm missing'), 'string failure'])('records a spawn failure', async (failure) => {
    const { root } = fixture()
    spawnMock.mockReturnValue(childProcess(failure))
    const status = join(root, 'private', 'status.json')
    expect(await runUpdateWorker(status, 'npm-global', '@monotykamary/dsh')).toBe(1)
    expect(JSON.parse(readFileSync(status, 'utf8'))).toMatchObject({ state: 'failed', error: failure instanceof Error ? 'npm missing' : 'string failure' })
  })
})
