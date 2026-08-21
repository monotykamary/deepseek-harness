/** Distribution update tracking and detached installation provider. */

import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Context } from '@monotykamary/cordis'
import { resolveDshHome } from '@monotykamary/dsh-home-paths'
import { TypertRemoteService, Remote } from '@monotykamary/dsh-typert-protocol'
import z from '@monotykamary/schemastery'
import type {
  DistributionPackageStatus, DistributionUpdateLaunch, DistributionUpdateSnapshot, InstallChannel,
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

function updateCommand(channel: InstallChannel, packageName: string): string | null {
  switch (channel) {
    case 'npm-global': return `npm install --global ${packageName}@latest`
    case 'npx': return `npx ${packageName}@latest web`
    case 'nix': return 'nix flake update'
    case 'source': return 'git pull --ff-only && pnpm install && pnpm run build'
    case 'unknown': return null
    /* v8 ignore next -- TypeScript closes InstallChannel; runtime input is normalized before this call. */
    default: channel satisfies never; return null
  }
}

/**
 * Read the app and its managed companions from the installed closure.
 * @param appManifest - absolute running app manifest path.
 * @returns installed DSH, Fabric, and Fovea versions.
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
  for (const name of ['dsh-fabric', 'dsh-fovea']) {
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
      return { ...pkg, latest, updateAvailable: latest !== pkg.installed }
    })
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Launch the owner-only npm updater worker for an npm-global installation.
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
  if (channel !== 'npm-global') {
    return { started: false, message: command ?? 'This installation channel must be updated by its package manager.', statusPath: null }
  }
  const statusPath = join(resolveDshHome(), 'updates', 'status.json')
  const worker = fileURLToPath(new URL('./startup.js', import.meta.url))
  const child = spawn(process.execPath, [worker, statusPath, app.name], {
    detached: true,
    stdio: 'ignore',
    cwd: dirname(appManifest),
    env: Object.fromEntries(Object.entries(process.env).filter(([key, value]) => value !== undefined
      && !/(?:KEY|SECRET|TOKEN|PASSWORD)/iu.test(key))),
  })
  child.unref()
  return { started: true, message: 'Update started. Restart DSH after it completes.', statusPath }
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
   * Start an npm-global update in a detached worker.
   * @returns the launch outcome, or manual guidance for other channels.
   */
  @Remote('start')
  start(): DistributionUpdateLaunch {
    return launchDetachedUpdate(this.config.appManifest)
  }
}

export default DistributionUpdateService
