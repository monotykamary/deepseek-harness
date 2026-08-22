/**
 * Deployment-surface resolution for `dsh web`: derives the tailnet and
 * portless serving authorities from the machine's installed tooling for the
 * /api browser-trust fence and the URL line. Every probe is best-effort
 * environment detection, not configuration validation: an absent binary, an
 * unmatched route, or a dead proxy yields a warning and no surface, never a
 * failed boot. Resolution never rejects; unexpected probe failures surface
 * as warnings too, so a hanging or broken tool cannot take the URL line
 * (a supervisor readiness signal) down with it.
 * @module @monotykamary/dsh-web-app/surfaces
 */

import { execFile } from 'node:child_process'
import { createConnection } from 'node:net'
import { promisify } from 'node:util'
import { portlessCliPath } from './portless.ts'

const execFileAsync = promisify(execFile)

/** Milliseconds one tailscale or portless binary invocation may run before the probe gives up. */
const BINARY_PROBE_TIMEOUT_MS = 3_000
/** Milliseconds one TCP connect probe may wait for the portless proxy. */
const PROXY_PROBE_TIMEOUT_MS = 1_000
/** The portless proxy's loopback HTTPS port (the fixed port its alias service owns). */
const PORTLESS_PROXY_PORT = 443
/** The portless alias naming this app's HTTPS surface: the `dsh.localhost` host. */
const PORTLESS_ALIAS_NAME = 'dsh'
/** Tailscale's canonical HTTPS port for `tailscale serve --https`. */
const TAILSCALE_HTTPS_PORT = 443

/** One derived remote surface: the announced URL plus the authority the trust fence accepts. */
export interface RemoteSurface {
  /** Full URL announced on the `dsh web:` line. */
  url: string
  /** Bare authority trusted by the /api fence (a host, matching any port). */
  authority: string
}

/** Settle-once result shared by the fence update and the URL line. */
export interface SurfaceResolution {
  /** The tailscale serve surface, when tailscale fronts the bound port. */
  tailnet?: RemoteSurface
  /** The portless HTTPS surface, when the proxy and its alias are live. */
  portless?: RemoteSurface
  /** Deployment-capability warnings (missing binary, offline, unmatched route). */
  warnings: string[]
}

/** Binary-execution and TCP-probe seams; defaults are the real node implementations. */
export interface SurfaceProbeOptions {
  /** Runs one tool invocation; defaults to execFile with a probe timeout. */
  exec?: (file: string, args: string[]) => Promise<{ stdout: string; stderr: string }>
  /** Answers whether a loopback host:port accepts TCP; defaults to a real connect probe. */
  probe?: (host: string, port: number) => Promise<boolean>
}

interface TailscaleServeStatus {
  TCP?: Record<string, { HTTPS?: boolean }>
  Web?: Record<string, { Handlers?: Record<string, { Proxy?: string }> }>
}

interface TailscaleSelfStatus {
  Self?: { DNSName?: string; Online?: boolean }
}

/** One settled probe: either a resolved surface or one human-readable warning. */
interface ProbeSettlement {
  surface?: RemoteSurface
  warning?: string
}

function isEnoent(error: unknown): boolean {
  return error instanceof Error && (error as NodeJS.ErrnoException).code === 'ENOENT'
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function parseJson(stdout: string): unknown {
  const trimmed = stdout.trim()
  if (trimmed === '') return null
  try {
    return JSON.parse(trimmed) as unknown
  } catch {
    return null
  }
}

const stripTrailingDot = (dnsName: string): string => dnsName.replace(/\.+$/, '')

const defaultExec = (file: string, args: string[]): Promise<{ stdout: string; stderr: string }> =>
  execFileAsync(file, args, { timeout: BINARY_PROBE_TIMEOUT_MS })

const defaultProbe = (host: string, port: number): Promise<boolean> =>
  new Promise((resolve) => {
    const socket = createConnection({ host, port })
    const timer = setTimeout(() => {
      socket.destroy()
      resolve(false)
    }, PROXY_PROBE_TIMEOUT_MS)
    socket.once('connect', () => {
      clearTimeout(timer)
      socket.destroy()
      resolve(true)
    })
    socket.once('error', () => {
      clearTimeout(timer)
      socket.destroy()
      resolve(false)
    })
  })

/**
 * Resolve the tailnet surface: the tailscale node DNS name when
 * `tailscale serve` fronts the bound port with HTTPS (canonical port 443
 * Web handler or a TCP HTTPS listener), else a warning naming the mismatch.
 * @param port - the webserver's bound port (the serve target).
 * @param exec - the binary seam.
 * @returns the surface or one warning.
 */
async function resolveTailnetSurface(
  port: number,
  exec: NonNullable<SurfaceProbeOptions['exec']>,
): Promise<ProbeSettlement> {
  let serveStdout: string
  try {
    serveStdout = (await exec('tailscale', ['serve', 'status', '--json'])).stdout
  } catch (error) {
    if (isEnoent(error)) {
      return { warning: 'tailscale not installed — install from https://tailscale.com/download' }
    }
    return { warning: `tailscale serve status failed: ${errorText(error)}` }
  }
  let selfStdout: string
  try {
    selfStdout = (await exec('tailscale', ['status', '--json'])).stdout
  } catch (error) {
    if (isEnoent(error)) {
      return { warning: 'tailscale not installed — install from https://tailscale.com/download' }
    }
    return { warning: `tailscale status failed: ${errorText(error)}` }
  }
  const self = (parseJson(selfStdout) as TailscaleSelfStatus | null)?.Self
  if (self?.Online === false) {
    return { warning: 'tailscale offline — run \`tailscale up\` before using the tailnet surface' }
  }
  const dnsName = stripTrailingDot(self?.DNSName ?? '')
  if (dnsName === '') {
    return { warning: 'tailscale node has no DNS name — run \`tailscale up\` before using the tailnet surface' }
  }
  const serveStatus = parseJson(serveStdout) as TailscaleServeStatus | null
  const webProxy = serveStatus?.Web?.[`${dnsName}:${TAILSCALE_HTTPS_PORT}`]?.Handlers?.['/']?.Proxy
  if (webProxy === `http://localhost:${port}` || webProxy === `http://127.0.0.1:${port}`) {
    return { surface: { url: `https://${dnsName}`, authority: dnsName } }
  }
  // TCP HTTPS listeners cover non-443 fronts (`tailscale serve --https <port>`).
  const httpsTcpPorts: number[] = []
  for (const [hostPort, entry] of Object.entries(serveStatus?.TCP ?? {})) {
    if (entry.HTTPS !== true) continue
    const match = /^(.*):(\d+)$/u.exec(hostPort)
    if (match === null) continue
    if (match[1] !== dnsName && match[1] !== 'localhost' && match[1] !== '127.0.0.1') continue
    httpsTcpPorts.push(Number(match[2]))
  }
  if (httpsTcpPorts.length > 0) {
    // Prefer the listener fronting this exact bound port, else the lowest.
    const chosen = httpsTcpPorts.includes(port) ? port : Math.min(...httpsTcpPorts)
    return { surface: { url: `https://${dnsName}:${chosen}`, authority: dnsName } }
  }
  return {
    warning: `tailscale serve does not front port ${port} — run \`tailscale serve --bg --https ${port} localhost:${port}\` to expose the tailnet surface`,
  }
}

/**
 * Resolve the portless surface: register the \`dsh\` alias for the bound port
 * and confirm the proxy serves loopback :443 (IPv4 or IPv6 — observed setups
 * answer on only one), else a warning naming the missing piece.
 * @param port - the webserver's bound port (the alias target).
 * @param exec - the binary seam.
 * @param probe - the TCP probe seam.
 * @returns the surface or one warning.
 */
async function resolvePortlessSurface(
  port: number,
  exec: NonNullable<SurfaceProbeOptions['exec']>,
  probe: NonNullable<SurfaceProbeOptions['probe']>,
): Promise<ProbeSettlement> {
  try {
    await exec(process.execPath, [portlessCliPath(), 'alias', PORTLESS_ALIAS_NAME, String(port), '--force'])
  } catch (error) {
    if (isEnoent(error)) {
      return { warning: 'bundled portless CLI is unavailable — reinstall DSH, then run `dsh portless setup`' }
    }
    return { warning: `portless alias registration failed: ${errorText(error)}` }
  }
  const live = (await Promise.all([
    probe('127.0.0.1', PORTLESS_PROXY_PORT),
    probe('::1', PORTLESS_PROXY_PORT),
  ])).some(Boolean)
  if (!live) {
    return { warning: 'portless proxy not running on :443 — run \`dsh portless setup\` for named localhost URLs' }
  }
  return {
    surface: {
      url: `https://${PORTLESS_ALIAS_NAME}.localhost`,
      authority: `${PORTLESS_ALIAS_NAME}.localhost`,
    },
  }
}

const settleUnexpected = (label: string) => (error: unknown): ProbeSettlement => ({
  warning: `${label} surface resolution failed: ${errorText(error)}`,
})

/**
 * Resolve the enabled remote surfaces for the bound port. Disabled flags run
 * no probe and settle at once; enabled probes run in parallel and every
 * failure, expected or not, lands in `warnings`.
 * @param port - the webserver's bound port.
 * @param tailnet - whether the tailscale serve surface is enabled.
 * @param portless - whether the portless HTTPS surface is enabled.
 * @param options - binary and probe seams (tests).
 * @returns the resolved surfaces and their warnings; never rejects.
 */
export async function resolveRemoteSurfaces(
  port: number,
  tailnet: boolean,
  portless: boolean,
  options: SurfaceProbeOptions = {},
): Promise<SurfaceResolution> {
  if (!tailnet && !portless) return { warnings: [] }
  const exec = options.exec ?? defaultExec
  const probe = options.probe ?? defaultProbe
  const [tailnetSettlement, portlessSettlement] = await Promise.all([
    tailnet
      ? resolveTailnetSurface(port, exec).catch(settleUnexpected('tailnet'))
      : Promise.resolve<ProbeSettlement>({}),
    portless
      ? resolvePortlessSurface(port, exec, probe).catch(settleUnexpected('portless'))
      : Promise.resolve<ProbeSettlement>({}),
  ])
  const resolution: SurfaceResolution = { warnings: [] }
  if (tailnetSettlement.surface !== undefined) resolution.tailnet = tailnetSettlement.surface
  if (tailnetSettlement.warning !== undefined) resolution.warnings.push(tailnetSettlement.warning)
  if (portlessSettlement.surface !== undefined) resolution.portless = portlessSettlement.surface
  if (portlessSettlement.warning !== undefined) resolution.warnings.push(portlessSettlement.warning)
  return resolution
}
