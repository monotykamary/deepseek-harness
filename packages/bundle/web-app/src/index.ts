/**
 * @monotykamary/dsh-web-app — the browser-surface bundle's runtime glue plugin
 * plus the bundle patch (`cordis.patch.yml`, declared by the `dsh.bundle.patch`
 * manifest field). The plugin owns the browser-surface glue: it resolves
 * the built frontend dist (workspace knowledge of this bundle, never user
 * config), mounts the `frontend-static` fallback owner over it, registers the
 * harness-source and web-surface prompt sections, the bash-visible web runtime
 * variable, the URL line, and the default-browser handoff. App command-line
 * values arrive through the `webStartup` service expressions in the bundle
 * patch.
 * @module @monotykamary/dsh-web-app
 */

import { spawn, type ChildProcess } from 'node:child_process'
import { createRequire } from 'node:module'
import { networkInterfaces } from 'node:os'
import { fileURLToPath } from 'node:url'
import type { Context } from '@monotykamary/cordis'
import z from '@monotykamary/schemastery'
import { addHarnessSourceSection } from '@monotykamary/dsh-app-boot'
import * as FrontendStatic from '@monotykamary/dsh-host-frontend-static'
import { launchEnvironmentOf } from '@monotykamary/dsh-launch-environment'
import { scrubbedParentEnv } from '@monotykamary/dsh-subprocess'
import type {} from '@monotykamary/cordis-plugin-loader'
// Type-only: resolves `ctx.get('connection')` to the /api fence owner.
import type {} from '@monotykamary/dsh-client-connection'
import type {} from '@monotykamary/dsh-host-webserver'
import type {} from '@monotykamary/dsh-system-prompt'
import type {} from '@monotykamary/dsh-shell-env'
import { resolveRemoteSurfaces, type SurfaceResolution } from './surfaces.ts'

/** Stable Cordis plugin name. */
export const name = 'web-app'

/** This dsh installation's root, from either this package's source or built entry. */
const SOURCE_ROOT = fileURLToPath(new URL('../../../..', import.meta.url))

/** Runtime service that releases Web rows after bind-dependent values resolve. */
const WEB_RUNTIME_SERVICE = 'webRuntime'

/** Services required before the web runtime can mount. */
export const inject = ['webServer']

/** Plugin config: composed deployment settings plus per-invocation command-line values. */
export interface Config {
  /** Permit default-browser handoff after the Loader tree settles; an SSH launch suppresses it. */
  openBrowser: boolean
  /** Print the URL line on activation; a non-interactive layer can turn it off. */
  printUrl: boolean
  /**
   * Register the model-visible surface context (the `app:web-surface` prompt
   * section and the `DSH_WEB_URL` bash variable). A one-shot non-interactive
   * layer can turn it off when its user is not in the GUI, so the
   * orientation text would be false.
   */
  surfaceContext: boolean
  /** Explicit `--trusted-host` authorities from this invocation. */
  trustedHosts: string[]
  /** `--tailnet`: resolve the tailscale serve surface, trust its DNS name, and announce its URL. */
  tailnet: boolean
  /** `--portless`: resolve the portless HTTPS surface, trust its alias host, and announce it. */
  portless: boolean
}

export const Config: z<Config> = z.object({
  openBrowser: z.boolean().default(true),
  printUrl: z.boolean().default(true),
  surfaceContext: z.boolean().default(true),
  trustedHosts: z.array(String).default([]),
  tailnet: z.boolean().default(false),
  portless: z.boolean().default(false),
})

/** Bind-dependent Web values shared by the trust fence and URL display. */
export interface WebRuntimeValues {
  /** LAN IPv4 literals sampled once when the server binds all interfaces. */
  lanAddresses: string[]
  /** LAN literals followed by explicit invocation authorities. */
  trustedHosts: string[]
}

/** Environment variable naming the canonical local URL of this Web GUI. */
const DSH_WEB_URL = 'DSH_WEB_URL' as const

// Display-only mirror of the webserver schema's loopback host: the address the
// local URL always prints. Not a source of truth — the schema is.
const LOOPBACK_HOST = '127.0.0.1'
/** The webserver schema's all-interfaces bind literal. */
const ALL_INTERFACES_HOST = '0.0.0.0'

/** Whether this process was launched through SSH, including a forwarded-port session. */
function launchedThroughSsh(ctx: Context): boolean {
  const environment = launchEnvironmentOf(ctx)
  return ['SSH_CONNECTION', 'SSH_TTY'].some((name) => {
    const value = environment.getFrom(name, ['process'])?.value
    return value !== undefined && value !== ''
  })
}

const BROWSER_OPENER_MODULE = import.meta.resolve('open')

const BROWSER_OPENER_PROGRAM = `
try {
  const { default: open } = await import(${JSON.stringify(BROWSER_OPENER_MODULE)})
  const launcher = await open(process.argv[1])
  if (process.platform === 'win32') {
    // open resolves at PowerShell spawn; keep it referenced until that launcher hands the URL to Windows.
    const code = launcher.exitCode ?? await new Promise((resolve, reject) => {
      function onError(error) {
        launcher.off('close', onClose)
        reject(error)
      }
      function onClose(code) {
        launcher.off('error', onError)
        resolve(code)
      }
      launcher.ref()
      launcher.once('error', onError)
      launcher.once('close', onClose)
    })
    if (code !== 0) throw new Error('browser operating-system launcher exited with code ' + String(code))
  }
  process.exitCode = 0
} catch (error) {
  // The parent turns this exit into the manual-URL warning.
  console.error(error)
  process.exitCode = 1
}
`

/**
 * Resolve one LAN-trust snapshot from the active server bind.
 *
 * Derived entries are port-less IP literals: DNS rebinding needs an
 * attacker-controlled name, while an IP-literal Host is safe on any port and
 * an OS-assigned port is unknowable before bind.
 * @param bindHost - the active webserver bind host.
 * @param extra - explicit `--trusted-host` values, in argument order.
 * @returns the LAN display addresses and invocation-derived fence authorities.
 */
export function resolveLanTrust(bindHost: string, extra: readonly string[]): WebRuntimeValues {
  const lanAddresses = bindHost === ALL_INTERFACES_HOST
    ? Object.values(networkInterfaces()).flat()
      .filter((iface): iface is NonNullable<typeof iface> => iface !== undefined && iface.family === 'IPv4' && !iface.internal)
      .map(iface => iface.address)
    : []
  return { lanAddresses, trustedHosts: [...lanAddresses, ...extra] }
}

/** Model-visible orientation and acceptance boundary for sessions created through `dsh web`. */
function webSurfacePrompt(webUrl: string): string {
  const updateContract = 'The client-plugin HMR receiver is active, but client-plugin changes reload without a refresh only while '
    + '`pnpm run dev:web` is also running from this same checkout to rebuild their bundles; verify that watcher before promising automatic updates. '
    + 'Every other change — the apps/web shell and plain packages — requires rebuilding the affected Web artifacts and verifying this existing URL after a page refresh. '
  return `You are interacting with the user through the DeepSeek Harness Web GUI at ${webUrl}. `
    + 'When the user refers to "this page", "this GUI", or "this app" without naming another target, they mean this GUI. '
    + 'The browser provides no implicit DOM, route, or screenshot context. '
    + updateContract
    + 'Starting another server does not update this GUI. '
    + 'The apps/web Vite entry builds the shell but is not a standalone application because only dsh web injects window.__DSH_BOOT__. '
    + 'Do not start a replacement server unless the user asks; if one is needed, use a managed background job and verify its exact URL.'
}

/** Resolve the canonical loopback URL from the active Web server. */
function localWebUrl(ctx: Context): string {
  const port = ctx.get('webServer')?.port
  if (port === undefined) throw new Error('web-app: webServer service missing while resolving Web runtime')
  return `http://${LOOPBACK_HOST}:${String(port)}`
}

/** Dist location is workspace knowledge of this bundle: resolved through the frontend package exports, not configured. */
function resolveDistIndex(): string {
  const require = createRequire(import.meta.url)
  try {
    return require.resolve('@monotykamary/dsh-web-frontend/dist/index.html')
  } catch {
    /* v8 ignore next 2 -- reachable only on a checkout without a built dist; the test tree builds it */
    throw new Error('web-app: frontend dist not built; run pnpm run build from the repository root first')
  }
}

/** Start the maintained platform opener without forwarding Harness credentials. */
function spawnBrowserLauncher(url: string): ChildProcess {
  return spawn(process.execPath, [
    '--input-type=module',
    '--eval', BROWSER_OPENER_PROGRAM,
    '--', url,
  ], {
    env: scrubbedParentEnv(),
    stdio: ['ignore', 'inherit', 'pipe'],
  })
}
/** Hand one URL to the operating system's default browser. */
async function openBrowser(url: string): Promise<void> {
  const launcher = spawnBrowserLauncher(url)
  let launcherStderr = ''
  launcher.stderr?.setEncoding('utf8')
  launcher.stderr?.on('data', (chunk: string) => { launcherStderr += chunk })
  await new Promise<void>((resolve, reject) => {
    function onError(error: Error): void {
      launcher.off('close', onClose)
      reject(error)
    }
    function onClose(code: number | null): void {
      launcher.off('error', onError)
      if (code !== 0) {
        const firstLine = launcherStderr.trim().split(/\r?\n/u)[0]
        const reason = firstLine === undefined || firstLine === ''
          ? `browser launcher exited with code ${String(code)}`
          : firstLine.replace(/^(?:[A-Za-z]*Error):\s*/u, '')
        reject(new Error(reason))
        return
      }
      if (launcherStderr !== '') process.stderr.write(launcherStderr)
      resolve()
    }
    launcher.once('error', onError)
    launcher.once('close', onClose)
  })
}
/** Test hooks for the built dist and native browser handoff; production never mutates them. */
/**
 * Test hooks: hosts with no built frontend dist substitute the dist resolver;
 * surface tests substitute the prober. Production never touches these.
 */
/**
 * Test hooks: hosts with no built frontend dist substitute the dist resolver;
 * surface tests substitute the prober. Production never touches these.
 */
export const internals: {
  resolveDistIndex: () => string
  resolveSurfaces: (port: number, tailnet: boolean, portless: boolean) => Promise<SurfaceResolution>
  openBrowser: (url: string) => Promise<void>
} = {
  resolveDistIndex,
  resolveSurfaces: resolveRemoteSurfaces,
  openBrowser,
}
/**
 * Resolve the enabled remote surfaces once per boot and publish their
 * authorities into the /api fence. The add runs only after resolution
 * commits, and a derived authority failing canonical validation is dropped
 * from the announcement with a warning instead of silently widening trust.
 * @param ctx - plugin context carrying the bound webServer and the connection fence owner.
 * @param config - validated plugin config.
 * @returns the settled surface snapshot the URL line announces.
 */
async function settleSurfaces(ctx: Context, config: Config): Promise<SurfaceResolution> {
  const resolved = await internals.resolveSurfaces(ctx.webServer.port, config.tailnet, config.portless)
  const connection = ctx.get('connection')
  const resolution: SurfaceResolution = { warnings: [...resolved.warnings] }
  for (const key of ['tailnet', 'portless'] as const) {
    const surface = resolved[key]
    if (surface === undefined) continue
    if (connection !== undefined) {
      try {
        connection.addTrustedAuthority(surface.authority)
      } catch (error) {
        resolution.warnings.push(
          `derived ${key} surface authority ${JSON.stringify(surface.authority)} refused: ${error instanceof Error ? error.message : String(error)}`,
        )
        continue
      }
    }
    resolution[key] = surface
  }
  return resolution
}
/**
 * Print the readiness URL line: the loopback URL first (supervisors parse
 * it), then the LAN snapshot and the derived remote surfaces.
 * @param ctx - plugin context carrying the bound webServer.
 * @param runtime - the bind-dependent LAN snapshot.
 * @param resolution - the settled surface snapshot.
 */
function printUrl(ctx: Context, runtime: WebRuntimeValues, resolution: SurfaceResolution): void {
  const port = ctx.webServer.port
  const entries: string[] = []
  const lanCandidate = runtime.lanAddresses[0]
  if (lanCandidate !== undefined) entries.push(`LAN: http://${lanCandidate}:${String(port)}`)
  if (resolution.tailnet !== undefined) entries.push(`tailnet: ${resolution.tailnet.url}`)
  if (resolution.portless !== undefined) entries.push(`portless: ${resolution.portless.url}`)
  console.log(`dsh web: ${localWebUrl(ctx)}${entries.length === 0 ? '' : ` (${entries.join(', ')})`}`)
}

/**
 * Mount the Web runtime: dist serving, surface prompt, the bash runtime
 * variable, the URL line, and the default-browser handoff.
 * @param ctx - plugin context carrying the webServer service.
 * @param config - validated {@link Config}.
 */
export function apply(ctx: Context, config: Config): void {
  const runtime = resolveLanTrust(ctx.webServer.host, config.trustedHosts)
  // The loopback URL belongs to this host. Under SSH, the operator reaches it
  // through a local forwarding address that this process cannot derive.
  const handoffBrowser = config.openBrowser && !launchedThroughSsh(ctx)
  // Release dependent rows only after bind-dependent trust has been sampled once.
  ctx.provide(WEB_RUNTIME_SERVICE, runtime)
  ctx.plugin(FrontendStatic, { distIndex: internals.resolveDistIndex() })
  if (config.surfaceContext) {
    ctx.inject(['systemPrompt'], (promptCtx) => {
      addHarnessSourceSection(promptCtx, SOURCE_ROOT)
      promptCtx.systemPrompt.section({
        name: 'app:web-surface',
        order: -98,
        text: () => webSurfacePrompt(localWebUrl(promptCtx)),
      })
    })
    ctx.inject(['shellEnv'], (runtimeCtx) => {
      runtimeCtx.shellEnv.register({
        name: 'web-runtime',
        variables: {
          [DSH_WEB_URL]: { description: 'Canonical local URL of the DeepSeek Harness Web GUI serving this session.' },
        },
        resolve: () => ({ [DSH_WEB_URL]: localWebUrl(runtimeCtx) }),
      })
    })
  }
  if (config.printUrl || handoffBrowser || config.tailnet || config.portless) {
  // the bound port and the connection fence owner both exist. The URL line is
  // a readiness signal: supervisors (and the keyless CLI smoke) RPC as soon as
  // they observe it, so it must not print while sibling rows (the /api route
  // owner) are still mounting. With both surface flags off the resolution
  // settles at once, so no probe delays the line.
    const settled = ctx.get('loader')?.await()
    const afterSettlement = async (): Promise<void> => {
      // The tree can be disposed while the boot was in flight (early SIGTERM);
      // a URL line for a dead server would only mislead, and reading the
      // torn-down port would turn a clean shutdown into a crash.
      if (ctx.get('webServer') === undefined) return
      const webUrl = localWebUrl(ctx)
      const resolution = await settleSurfaces(ctx, config)
      for (const warning of resolution.warnings) ctx.logger.warn(warning)
      if (config.printUrl) {
        printUrl(ctx, runtime, resolution)
      }
      if (handoffBrowser) {
        console.log('dsh web: opening the default browser; pass --no-open to disable')
        void internals.openBrowser(webUrl).catch((error: unknown) => {
          const reason = error instanceof Error ? error.message : String(error)
          console.error(`web-app: could not open the default browser because ${reason}; visit ${webUrl} manually`)
        })
      }
    }
    // This row's own activation can precede a sibling failure. The app owns
    // readiness by waiting for its Loader tree, or runs at once in a
    // hand-built context without Loader.
    if (settled === undefined) void afterSettlement()
    else {
      void settled.then(afterSettlement, () => {
        // Loader reports a failed boot; this row only stays quiet.
      })
    }
  }
}
