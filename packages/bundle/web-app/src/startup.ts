/**
 * The web app's command-line provider: it parses the `dsh --profile web` flag
 * family (`--host`, `--port`, `--trusted-host`, `--tailnet`,
 * `--portless`, `--no-open`) and its `--help` text, then provides the
 * immutable values as {@link WEB_STARTUP_SERVICE}. Ordinary rows inject that
 * service before reading it from lazy config.
 * @module @monotykamary/dsh-web-app/startup
 */

import { Command } from 'commander'
import type { Context } from '@monotykamary/cordis'
import { parseCmdline } from '@monotykamary/dsh-cmdline'

/** Stable Cordis plugin name. */
export const name = 'web-startup'

/** Services required before the flags can be resolved. */
export const inject = ['cmdlineArgs']

/** Service provided by this ordinary plugin and injected by flag-configured rows. */
export const WEB_STARTUP_SERVICE = 'webStartup'

/** What the web rows read from {@link WEB_STARTUP_SERVICE}. */
export interface WebStartupValues {
  /** Whether this invocation opens the default browser after startup. */
  openBrowser: boolean
  /** `--host`, absent when the invocation did not name one. */
  host?: string
  /** `--port`, absent when the invocation did not name one. */
  port?: number
  /** Explicit `--trusted-host` authorities, in argument order. */
  trustedHosts: string[]
  /** `--tailnet`: resolve and trust the tailscale serve surface. */
  tailnet: boolean
  /** `--portless`: resolve and trust the portless HTTPS surface. */
  portless: boolean
  /** The identity provider config `--identity` assembled, absent when off. */
  identity?: {
    provider: 'header'
    header?: string
    trustedProxy?: string
  } | {
    provider: 'passkey'
    rpName?: string
    registration?: 'open' | 'closed'
  }
}

/** The web flag family, as commander parsed it. */
interface WebOptions {
  host?: string
  open: boolean
  port?: string
  trustedHost?: string[]
  tailnet?: boolean
  portless?: boolean
  identity?: 'header' | 'passkey'
  identityHeader?: string
  identityTrustedProxy?: string
  identityRegistration?: 'open' | 'closed'
  identityRpName?: string
}

/**
 * This app's command: its flags, its description, and its help text.
 * @returns a fresh program, so one process can parse more than once (tests).
 */
function webCommand(): Command {
  return new Command()
    .name('dsh --profile web')
    .description('Serve the DeepSeek Harness browser UI.')
    .helpOption('-h, --help', 'show this help')
    .option('--host <host>', 'bind host')
    .option('--no-open', 'do not open the Web UI in the default browser')
    .option('--port <port>', 'listen port; pass 0 to let the OS pick a free one')
    .option('--trusted-host <authority...>', 'extra authority the /api browser-trust fence accepts (host or host:port; repeatable)')
    .option('--tailnet', 'resolve the tailscale serve surface: trust its DNS name and announce its URL')
    .option('--portless', 'resolve the portless HTTPS surface: register the dsh alias, trust dsh.localhost, and announce it')
    .option('--identity <provider>', 'identity provider: header (trust a reverse proxy) or passkey (WebAuthn)')
    .option('--identity-header <name>', 'identity header the trusted proxy sets (default x-forwarded-user)')
    .option('--identity-trusted-proxy <spec>', 'source allowlist for the identity header: loopback (default), private, a CIDR, or an address')
    .option('--identity-registration <policy>', 'passkey registration: open (default) or closed')
    .option('--identity-rp-name <name>', 'passkey relying-party display name (default dsh)')
    .addHelpText('after', `
Examples:
  dsh --profile web                          serve on the composed host and port
  dsh --profile web --no-open                serve without opening a browser
  dsh --profile web --port 8080              serve on another port
  dsh --profile web --tailnet                announce and trust https://<node>.ts.net
  dsh --profile web --identity header        partition sessions by a proxy-set x-forwarded-user
  dsh --profile web --identity passkey       self-contained WebAuthn login (prints an operator token)
`)
}

/**
 * Parse and provide the Web invocation as an ordinary Cordis service. The
 * command's action publishes the flags this invocation named; `--host 0.0.0.0`
 * or a non-numeric `--port` is a usage error, so on rejection (and on `--help`)
 * nothing is provided.
 * @param ctx - plugin context carrying the command line.
 */
export function apply(ctx: Context): void {
  const program = webCommand()
  program.action(() => {
    const options = program.opts<WebOptions>()
    if (options.host === '0.0.0.0') {
      program.error('error: --host 0.0.0.0 is intentionally not supported yet for safety: it would expose remote code execution to the network; use 127.0.0.1 instead')
    }
    if (options.port !== undefined && !/^\d+$/.test(options.port)) {
      program.error(`error: --port must be a number, got ${JSON.stringify(options.port)}`)
    }
    const identity: WebStartupValues['identity'] = options.identity === 'header'
      ? {
        provider: 'header',
        ...options.identityHeader !== undefined && { header: options.identityHeader },
        ...options.identityTrustedProxy !== undefined && { trustedProxy: options.identityTrustedProxy },
      }
      : options.identity === 'passkey'
        ? {
          provider: 'passkey',
          ...options.identityRegistration !== undefined && { registration: options.identityRegistration },
          ...options.identityRpName !== undefined && { rpName: options.identityRpName },
        }
        : undefined
    ctx.provide(WEB_STARTUP_SERVICE, {
      openBrowser: options.open,
      ...options.host !== undefined && { host: options.host },
      ...options.port !== undefined && { port: Number(options.port) },
      trustedHosts: options.trustedHost ?? [],
      tailnet: options.tailnet ?? false,
      portless: options.portless ?? false,
      ...identity === undefined ? {} : { identity },
    } satisfies WebStartupValues)
  })
  parseCmdline(ctx, program)
}
