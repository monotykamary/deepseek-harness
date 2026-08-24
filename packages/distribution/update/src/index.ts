/** Distribution update tracking and detached installation provider. */

import { spawn, spawnSync } from 'node:child_process'
import { accessSync, constants, existsSync, readFileSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, parse, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Context } from '@monotykamary/cordis'
import { resolveDshHome } from '@monotykamary/dsh-home-paths'
import { launcherPath as landlockLauncherPath, probe as probeLandlock } from '@monotykamary/node-addon-landlock-run'
import { TypertRemoteService, Remote } from '@monotykamary/dsh-typert-protocol'
import z from '@monotykamary/schemastery'
import { gt, minVersion, valid } from 'semver'
import type {
  DistributionPackageStatus, DistributionUpdateLaunch, DistributionUpdateSnapshot, InstallChannel,
  InstallationDiagnostic,
} from './types.ts'

export type * from './types.ts'

interface PackageManifest {
  name?: unknown
  version?: unknown
  dependencies?: unknown
}

/** Registry and scheduling policy for update checks. */
export interface Config {
  /** Absolute manifest path of the running `@monotykamary/dsh` app. */
  appManifest: string
  /** npm-compatible registry base URL used for the DSH latest-tag request. */
  registryUrl?: string
  /** Whether the Host checks the registry as soon as this service mounts. */
  checkOnStartup?: boolean
  /** Milliseconds between background registry checks. */
  checkIntervalMs?: number
  /** Milliseconds before one registry request is aborted. */
  requestTimeoutMs?: number
}

interface ResolvedConfig {
  appManifest: string
  registryUrl: string
  checkOnStartup: boolean
  checkIntervalMs: number
  requestTimeoutMs: number
}

function readManifest(path: string): PackageManifest {
  return JSON.parse(readFileSync(path, 'utf8')) as PackageManifest
}

function packageVersion(path: string): string {
  const version = readManifest(path).version
  if (typeof version !== 'string') throw new Error(`distribution-update: ${path} declares no version`)
  return version
}

/**
 * Detect how the running app should be updated without package-manager probes.
 * @param appManifest - absolute running app manifest path.
 * @param override - explicit deployment channel, normally `DSH_INSTALL_CHANNEL`.
 * @returns the detected installation channel.
 */
export function detectInstallChannel(appManifest: string, override = process.env.DSH_INSTALL_CHANNEL): InstallChannel {
  if (override === 'nix' || override === 'npm-global' || override === 'npx' || override === 'source') return override
  const normalized = appManifest.replaceAll('\\', '/')
  if (normalized.includes('/apps/cli/package.json')) return 'source'
  if (normalized.includes('/_npx/') || normalized.includes('/pnpm/dlx/')) return 'npx'
  if (normalized.includes('/nix/store/')) return 'nix'
  if (normalized.includes('/lib/node_modules/') || normalized.includes('/AppData/Roaming/npm/node_modules/')) return 'npm-global'
  return 'unknown'
}

/** Inputs overridden by deterministic doctor tests; production uses the host. */
export interface InstallationDiagnosticOptions {
  /** Host platform. */
  readonly platform?: NodeJS.Platform
  /** Host environment used by command and desktop checks. */
  readonly env?: NodeJS.ProcessEnv
  /** DSH home whose writable ancestor is checked. */
  readonly dshHome?: string
  /** Bounded command probe. */
  readonly run?: (command: string, args: readonly string[]) => boolean
  /** Installation-owned Landlock probe. */
  readonly landlock?: () => 'full' | 'partial' | 'unusable'
  /** Writable-ancestor probe. */
  readonly writable?: (path: string) => boolean
}

function writableAncestor(path: string): boolean {
  let candidate = resolve(path)
  while (!existsSync(candidate)) {
    const parent = dirname(candidate)
    /* v8 ignore next -- every supported filesystem exposes its parsed root as an existing directory */
    if (parent === candidate) return false
    candidate = parent
  }
  try {
    if (!statSync(candidate).isDirectory()) return false
    accessSync(candidate, constants.W_OK | constants.X_OK)
    return true
  } catch {
    return false
  }
}

/**
 * Sample host prerequisites used by the shipped Web profile without network access.
 * @param options - deterministic host overrides for tests.
 * @returns ordered actionable diagnostics; blocking entries prevent reliable tool execution.
 */
export function installationDiagnostics(options: InstallationDiagnosticOptions = {}): InstallationDiagnostic[] {
  const platform = options.platform ?? process.platform
  const env = options.env ?? process.env
  const run = options.run ?? ((command, args) => {
    const result = spawnSync(command, [...args], { stdio: 'ignore', timeout: 3_000, env })
    return result.status === 0
  })
  const dshHome = options.dshHome ?? resolveDshHome()
  const diagnostics: InstallationDiagnostic[] = []
  const writable = options.writable ?? writableAncestor
  diagnostics.push(writable(dshHome)
    ? { id: 'dsh-home', severity: 'ok', summary: `DSH home is writable: ${dshHome}`, remediation: null }
    : { id: 'dsh-home', severity: 'blocking', summary: `DSH home is not writable: ${dshHome}`, remediation: 'Set DSH_HOME to a writable private directory.' })

  const shellReady = platform === 'win32'
    ? run('pwsh', ['-NoLogo', '-NoProfile', '-Command', 'exit 0']) || run('powershell.exe', ['-NoLogo', '-NoProfile', '-Command', 'exit 0'])
    : run('bash', ['--noprofile', '--norc', '-c', 'exit 0'])
  diagnostics.push(shellReady
    ? { id: 'shell', severity: 'ok', summary: platform === 'win32' ? 'PowerShell is available.' : 'Bash is available.', remediation: null }
    : { id: 'shell', severity: 'blocking', summary: platform === 'win32' ? 'PowerShell is unavailable.' : 'Bash is unavailable.', remediation: platform === 'win32' ? 'Install PowerShell 7 or restore Windows PowerShell.' : 'Install Bash and ensure `bash` is on PATH.' })

  let sandboxReady = true
  let sandboxSummary = 'The installation-owned Windows ACL sandbox is available.'
  let sandboxRemediation: string | null = null
  if (platform === 'linux') {
    const bwrap = run('bwrap', [
      '--ro-bind', '/', '/', '--proc', '/proc', '--dev', '/dev',
      '--unshare-all', '--share-net', '--die-with-parent', '--', 'true',
    ])
    const landlock = bwrap ? 'unusable' : (options.landlock ?? (() => probeLandlock(landlockLauncherPath(), { timeoutMs: 3_000 })))()
    sandboxReady = bwrap || landlock !== 'unusable'
    sandboxSummary = bwrap ? 'Bubblewrap sandbox is available.'
      : landlock === 'full' ? 'Installation-owned Landlock sandbox is available.'
        : landlock === 'partial' ? 'Installation-owned Landlock sandbox is available with partial kernel enforcement.'
          : 'No usable Linux sandbox is available.'
    sandboxRemediation = sandboxReady ? null : 'Install bubblewrap (`bwrap`) or enable Landlock in the running kernel.'
  } else if (platform === 'darwin') {
    sandboxReady = run('sandbox-exec', ['-p', '(version 1) (allow default)', '--', 'true'])
    sandboxSummary = sandboxReady ? 'macOS Seatbelt sandbox is available.' : 'macOS sandbox-exec is unavailable.'
    sandboxRemediation = sandboxReady ? null : 'Use a supported macOS installation that provides sandbox-exec.'
  } else if (platform !== 'win32') {
    sandboxReady = false
    sandboxSummary = `No sandbox backend supports ${platform}.`
    sandboxRemediation = 'Use Linux, macOS, or Windows, or configure a trusted sandbox runner.'
  }
  diagnostics.push({ id: 'sandbox', severity: sandboxReady ? 'ok' : 'blocking', summary: sandboxSummary, remediation: sandboxRemediation })

  const desktopReady = platform !== 'linux' || Boolean(env.DISPLAY || env.WAYLAND_DISPLAY || env.WSL_DISTRO_NAME || env.WSL_INTEROP)
  diagnostics.push(desktopReady
    ? { id: 'desktop', severity: 'ok', summary: 'Desktop handoff is available.', remediation: null }
    : { id: 'desktop', severity: 'warning', summary: 'No Linux desktop session was detected; automatic browser and native file opening may be unavailable.', remediation: 'Open the printed Web URL manually or provide DISPLAY/WAYLAND_DISPLAY.' })
  return diagnostics
}

function updateCommand(channel: InstallChannel, packageName: string): string | null {
  switch (channel) {
    case 'npm-global': return `npm install --global ${packageName}@latest`
    case 'npx': return `npx ${packageName}@latest web`
    case 'nix': return 'nix flake update'
    case 'source': return null
    case 'unknown': return null
    /* v8 ignore next -- TypeScript closes InstallChannel; runtime input is normalized before this call. */
    default: channel satisfies never; return null
  }
}

/**
 * Read the app and its managed companions from the installed closure.
 * @param appManifest - absolute running app manifest path.
 * @returns installed DSH and every tested external companion version.
 */
export function installedDistribution(appManifest: string): DistributionPackageStatus[] {
  const app = readManifest(appManifest)
  if (typeof app.name !== 'string' || typeof app.version !== 'string') {
    throw new Error(`distribution-update: invalid app manifest ${appManifest}`)
  }
  const statuses: DistributionPackageStatus[] = [{
    name: app.name, installed: app.version, latest: null, updateAvailable: false,
  }]
  const dependencies = app.dependencies
  if (dependencies === null || typeof dependencies !== 'object' || Array.isArray(dependencies)) return statuses
  const require = createRequire(appManifest)
  for (const name of ['dsh-tool-repair', 'dsh-fabric', 'dsh-fovea', 'dsh-factory']) {
    if (!(name in dependencies)) continue
    const manifestPath = require.resolve(`${name}/package.json`)
    statuses.push({ name, installed: packageVersion(manifestPath), latest: null, updateAvailable: false })
  }
  return statuses
}

/**
 * Fetch the latest DSH release and its tested companion versions.
 * @param appManifest - absolute running app manifest path.
 * @param registryUrl - npm-compatible registry base URL.
 * @param requestTimeoutMs - request deadline in milliseconds.
 * @returns installed packages paired with tested target versions.
 */
export async function checkInstalledDistribution(
  appManifest: string, registryUrl = 'https://registry.npmjs.org', requestTimeoutMs = 5_000,
): Promise<DistributionPackageStatus[]> {
  const installed = installedDistribution(appManifest)
  const app = installed[0]
  /* v8 ignore next -- installedDistribution validates and always inserts the app first. */
  if (app === undefined) throw new Error('distribution-update: installed distribution has no app')
  const controller = new AbortController()
  const timeout = setTimeout(() => { controller.abort() }, requestTimeoutMs)
  try {
    const url = `${registryUrl.replace(/\/$/, '')}/${encodeURIComponent(app.name)}/latest`
    const response = await fetch(url, { signal: controller.signal, headers: { accept: 'application/json' } })
    if (!response.ok) throw new Error(`${app.name}: registry returned HTTP ${String(response.status)}`)
    const body = await response.json() as { version?: unknown; dependencies?: unknown }
    if (typeof body.version !== 'string') throw new Error(`${app.name}: registry response has no version`)
    const dependencies = body.dependencies
    return installed.map((pkg): DistributionPackageStatus => {
      const latest = pkg.name === app.name
        ? body.version as string
        : dependencies !== null && typeof dependencies === 'object' && !Array.isArray(dependencies)
          ? (dependencies as Record<string, unknown>)[pkg.name]
          : undefined
      if (typeof latest !== 'string') {
        throw new Error(`${app.name}: latest release has no tested version for ${pkg.name}`)
      }
      const installedVersion = valid(pkg.installed)
      if (installedVersion === null) throw new Error(`${pkg.name}: installed manifest has invalid version ${pkg.installed}`)
      const exactTarget = valid(latest)
      const minimumTarget = exactTarget === null ? minVersion(latest) : null
      if (exactTarget === null && minimumTarget === null) {
        throw new Error(`${app.name}: latest release has invalid version requirement for ${pkg.name}`)
      }
      const targetFloor = exactTarget ?? minimumTarget?.version
      /* v8 ignore next -- exactTarget or minimumTarget supplied targetFloor. */
      if (targetFloor === undefined) throw new Error(`${pkg.name}: target version has no minimum`)
      return { ...pkg, latest, updateAvailable: gt(targetFloor, installedVersion) }
    })
  } finally {
    clearTimeout(timeout)
  }
}

function sourceRoot(appManifest: string): string {
  const filesystemRoot = parse(appManifest).root
  let directory = dirname(appManifest)
  while (directory !== filesystemRoot) {
    if (existsSync(join(directory, 'pnpm-workspace.yaml')) && existsSync(join(directory, '.git'))) return directory
    directory = dirname(directory)
  }
  throw new Error(`distribution-update: cannot locate source repository above ${appManifest}`)
}

/**
 * Launch the owner-only updater worker for an automatic installation channel.
 * @param appManifest - absolute running app manifest path.
 * @returns launch outcome or channel-specific manual guidance.
 */
export function launchDetachedUpdate(appManifest: string): DistributionUpdateLaunch {
  const packages = installedDistribution(appManifest)
  const app = packages[0]
  /* v8 ignore next -- installedDistribution always inserts the validated app first. */
  if (app === undefined) throw new Error('distribution-update: installed distribution has no app')
  const channel = detectInstallChannel(appManifest)
  const command = updateCommand(channel, app.name)
  if (channel !== 'npm-global' && channel !== 'source') {
    return { started: false, message: command ?? 'This installation channel must be updated by its package manager.', statusPath: null }
  }
  const target = channel === 'source' ? sourceRoot(appManifest) : app.name
  const statusPath = join(resolveDshHome(), 'updates', 'status.json')
  const worker = fileURLToPath(new URL('./startup.js', import.meta.url))
  const child = spawn(process.execPath, [worker, statusPath, channel, target], {
    detached: true,
    stdio: 'ignore',
    cwd: channel === 'source' ? target : dirname(appManifest),
    env: Object.fromEntries(Object.entries(process.env).filter(([key, value]) => value !== undefined
      && !/(?:KEY|SECRET|TOKEN|PASSWORD)/iu.test(key))),
  })
  child.unref()
  return { started: true, message: 'Update started. Restart DSH after it completes.', statusPath }
}

/** Test hook for startup diagnostic sampling; production never mutates it. */
export const internals: { diagnose: () => InstallationDiagnostic[] } = {
  diagnose: installationDiagnostics,
}

/** Remote service exposing cached status, explicit refresh, and detached npm-global installation. */
export class DistributionUpdateService extends TypertRemoteService {
  static Config: z<Config> = z.object({
    appManifest: z.string().required(),
    registryUrl: z.string().default('https://registry.npmjs.org'),
    checkOnStartup: z.boolean().default(true),
    checkIntervalMs: z.number().min(60_000).default(21_600_000),
    requestTimeoutMs: z.number().min(100).default(5_000),
  })

  private readonly config: ResolvedConfig
  private packages: DistributionPackageStatus[]
  private checkedAt: number | null = null
  private error: string | null = null
  private pending: Promise<DistributionUpdateSnapshot> | null = null
  private readonly channel: InstallChannel
  private readonly appName: string
  private readonly diagnostics: InstallationDiagnostic[]

  constructor(ctx: Context, config: Config) {
    super(ctx, 'distributionUpdate')
    this.config = {
      appManifest: config.appManifest,
      registryUrl: config.registryUrl ?? 'https://registry.npmjs.org',
      checkOnStartup: config.checkOnStartup ?? true,
      checkIntervalMs: config.checkIntervalMs ?? 21_600_000,
      requestTimeoutMs: config.requestTimeoutMs ?? 5_000,
    }
    this.packages = installedDistribution(config.appManifest)
    const app = this.packages[0]
    /* v8 ignore next -- installedDistribution always inserts the validated app first. */
    if (app === undefined) throw new Error('distribution-update: installed distribution has no app')
    this.appName = app.name
    this.channel = detectInstallChannel(config.appManifest)
    this.diagnostics = internals.diagnose()
    for (const diagnostic of this.diagnostics) {
      if (diagnostic.severity === 'ok') continue
      ctx.logger.warn(`[${diagnostic.severity}] ${diagnostic.summary}${diagnostic.remediation === null ? '' : ` ${diagnostic.remediation}`}`)
    }
    const timer = setInterval(() => { void this.check() }, this.config.checkIntervalMs)
    timer.unref()
    ctx.effect(() => () => { clearInterval(timer) }, 'distribution-update: registry check timer')
    if (this.config.checkOnStartup) void this.check()
  }

  private snapshotValue(): DistributionUpdateSnapshot {
    return {
      channel: this.channel,
      checkedAt: this.checkedAt,
      checking: this.pending !== null,
      error: this.error,
      updateAvailable: this.packages.some(pkg => pkg.updateAvailable),
      packages: this.packages.map(pkg => ({ ...pkg })),
      updateCommand: updateCommand(this.channel, this.appName),
      diagnostics: this.diagnostics.map(item => ({ ...item })),
    }
  }

  /**
   * Return cached update status without network access.
   * @returns the current immutable status snapshot.
   */
  @Remote('snapshot')
  snapshot(): DistributionUpdateSnapshot {
    return this.snapshotValue()
  }

  /**
   * Refresh targets from the latest DSH release manifest.
   * @returns the settled status snapshot; registry failures remain in `error`.
   */
  @Remote('check')
  check(): Promise<DistributionUpdateSnapshot> {
    if (this.pending !== null) return this.pending
    const task = checkInstalledDistribution(
      this.config.appManifest, this.config.registryUrl, this.config.requestTimeoutMs,
    ).then((packages) => {
      this.packages = packages
      this.checkedAt = Date.now()
      this.error = null
      this.pending = null
      return this.snapshotValue()
    }, (error: unknown) => {
      this.checkedAt = Date.now()
      this.error = error instanceof Error ? error.message : String(error)
      this.pending = null
      return this.snapshotValue()
    })
    this.pending = task
    return task
  }

  /**
   * Start an automatic update in a detached worker.
   * @returns the launch outcome, or manual guidance for externally managed channels.
   */
  @Remote('start')
  start(): DistributionUpdateLaunch {
    return launchDetachedUpdate(this.config.appManifest)
  }
}

export default DistributionUpdateService
