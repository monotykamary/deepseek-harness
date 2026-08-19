/** Host HTTP bridge for browser-client RPC. */
import type { Context } from '@monotykamary/cordis'
import z from '@monotykamary/schemastery'
import type {} from '@monotykamary/dsh-attachment'
// Activates the webServer Context merge used below.
import type { WebRoute } from '@monotykamary/dsh-host-webserver'
import { toFetchHandler } from '@monotykamary/dsh-host-apiproxy'
import type { IncomingMessage } from 'node:http'
import type { Duplex } from 'node:stream'
import { API_PATH, HOST_EVENTS_PATH, MUX_EVENTS_PATH } from './api-path.ts'
import { bridge, DEFAULT_MAX_REQUEST_BODY_BYTES } from './http-bridge.ts'
import { assertTrustedAuthority, isTrustedApiRequest } from './api-request-trust.ts'
import { HostConnectionService } from './rpc-host.ts'
import { rejectWebSocketUpgrade, WebSocketDownlinks } from './websocket-downlink.ts'
// Type-only: merges the optional ctx.identity authority the /api route and
// WebSocket upgrades gate through.
import type { Admission } from '@monotykamary/dsh-web-identity'
import type {} from '@monotykamary/dsh-web-identity'

export type {
  ConnectionRpcAuthority,
  ConnectionRpcEndpointMatcher,
  ConnectionRpcHandler,
  ConnectionRpcHandlerOptions,
  HostConnectionHandle,
  HostConnectionRpc,
} from './rpc.ts'
export type { ConnectionUpgradeAdmission, ConnectionUpgradeHandler } from './upgrade.ts'
export { HostConnectionService } from './rpc-host.ts'

export { API_PATH, HOST_EVENTS_PATH, MUX_EVENTS_PATH } from './api-path.ts'

/** Stable Cordis plugin name. */
export const name = 'client-connection'

/** Headroom for RPC JSON fields around aggregate base64 image payloads. */
const REQUEST_ENVELOPE_HEADROOM_BYTES = 1024 * 1024

function assertImageBodyCapacity(ctx: Context, maxRequestBodyBytes: number): void {
  const attachments = ctx.get('attachments')
  if (attachments === undefined) return
  const requiredImageBodyBytes = Math.ceil(
    attachments.imageLimits.maxMessageImageBytes * 4 / 3,
  ) + REQUEST_ENVELOPE_HEADROOM_BYTES
  if (maxRequestBodyBytes < requiredImageBodyBytes) {
    throw new Error(
      `client-connection maxRequestBodyBytes (${String(maxRequestBodyBytes)}) must be at least `
      + `${String(requiredImageBodyBytes)} for the configured aggregate image limit`,
    )
  }
}

/** Services required before providing Connection; API Proxy is an optional `/api` fallback. */
export const inject = ['webServer']

/** Plugin config: the deployment's non-loopback serving authorities. */
export interface ConnectionConfig {
  /**
   * Authorities this deployment serves beyond loopback: exact `host:port`, or
   * port-less `host` matching any port. The /api trust fence refuses any
   * request whose Host is neither loopback nor listed here, so a
   * non-loopback (`0.0.0.0`) deployment must declare the names it is reached
   * by (the dsh CLI derives the machine's LAN IP literals itself). An entry
   * that is not a bare, canonical authority fails the plugin load.
   */
  trustedHosts?: string[]
  /** Maximum buffered JSON body for every `/api` request. */
  maxRequestBodyBytes?: number
}

export const Config: z<ConnectionConfig> = z.object({
  trustedHosts: z.array(String).default([]),
  maxRequestBodyBytes: z.natural().min(1).default(DEFAULT_MAX_REQUEST_BODY_BYTES),
})

/**
 * Methods gated to the operator-eligible plane. Native dialogs act on the
 * host machine; the settings and credential domains mutate the user's
 * configuration and secret store, and READING them is equally privileged —
 * `settings.describe` returns every exposed namespace's configuration and
 * `credentials.describe` reports whether an arbitrary environment-variable
 * name is configured and where from, which is reconnaissance no anonymous
 * caller should have. `llm.discoverModels` belongs to that plane on both
 * counts: it carries a draft credential, and it makes the HOST issue a GET to
 * a URL the caller chose and reports back the status or the parsed body — a
 * caller on the wire would have a probe for whatever the host can reach and
 * the browser cannot.
 *
 * Admission is the operator tier: owner null, admitted by surface (loopback,
 * or any authority in the deployment's live trusted list — `trustedHosts`
 * plus the tailnet/portless authorities `dsh web` derives) or by the
 * operator bearer token when an identity authority is configured. The fence
 * is still a reachability policy, not authentication: the surface the
 * deployment named is trusted for its own configuration plane, and
 * DNS-rebinding plus cross-site markers still bind every caller. A partitioned
 * user (owner non-null) is refused even on loopback — the token is how the
 * operator works in passkey mode.
 *
 * The model catalog (`llm.providers`, `llm.models`) is deliberately NOT here:
 * it carries provider ids, display names, and model lists — no endpoints,
 * keys, or key state — and a LAN client's model picker legitimately needs it.
 */
const PRIVILEGED_METHODS = new Set([
  // A preset composition names the plugins a session runs, so reading one is
  // reconnaissance; copy and remove rearrange what the deployment offers, and
  // openDocument drives the host desktop — all more than the roster beside
  // them. (Authoring is copy-only, so no method here accepts composition text
  // or a path; the pin is about who may manage the roster at all.)
  //
  // CHOOSING one is not pinned, and `agentPreset.list` is not either. Picking a
  // preset looks like escalation — one of them mounts the toolset that edits the
  // live runtime — but `session.create` already takes an `agentPreset`, so
  // pinning only the switch would leave the same capability one method over.
  // The deeper reason is that the capability is not the preset's to grant: the
  // deployment's own default already carries `bash` and the filesystem tools, so
  // any caller that may start a session at all can already run commands as this
  // process. Pinning the switch would be a fence beside an open gate.
  'agentPreset.read',
  'agentPreset.copy',
  'agentPreset.openDocument',
  'agentPreset.remove',
  'host.pickDirectory',
  'host.openPath',
  'settings.describe',
  'settings.openDocument',
  'settings.update',
  'settings.replace',
  'settings.mutate',
  'credentials.describe',
  'credentials.set',
  'credentials.unset',
  'llm.discoverModels',
])

/**
 * Mounts the API gateway under the browser transport prefix. Every request on
 * the prefix passes the browser-trust fence first (DNS-rebinding and
 * cross-site defense — [api-request-trust](./api-request-trust.ts));
 * privileged methods additionally require the operator-eligible plane:
 * loopback or one of the deployment's live trusted authorities, or the
 * operator bearer token when an identity authority is configured.
 * @param ctx - Host plugin context.
 * @param config - resolved plugin config (schema defaults applied).
 */
export function apply(ctx: Context, config?: ConnectionConfig): void {
  // The Loader resolves schema defaults; hand-built test contexts may pass none.
  const trustedHosts = config?.trustedHosts ?? []
  const maxRequestBodyBytes = config?.maxRequestBodyBytes ?? DEFAULT_MAX_REQUEST_BODY_BYTES
  // Config boundary: a malformed entry fails the load loudly here rather than
  // silently authorizing its hostname prefix at request time.
  for (const entry of trustedHosts) assertTrustedAuthority(entry)
  if (ctx.get('apiProxy') !== undefined) assertImageBodyCapacity(ctx, maxRequestBodyBytes)
  const connection = new HostConnectionService(ctx, trustedHosts)
  const fetchHandler = connection.createSharedFetchHandler(API_PATH, {
    async fetch(request) {
      const pathname = new URL(request.url).pathname
      const method = pathname.startsWith(`${API_PATH}/`)
        ? pathname.slice(API_PATH.length + 1)
        : undefined
      // Privileged plane: the operator tier owns it — admitted by surface
      // (loopback or a deployment trusted authority, the live list the
      // ordinary fence reads) or by the operator bearer token. A partitioned
      // user is refused even on loopback — the token is how the operator
      // works in passkey mode.
      if (method !== undefined && PRIVILEGED_METHODS.has(method)) {
        const admission: Admission = ctx.get('identity')?.current()
          ?? { owner: null, operator: false }
        if (admission.owner !== null || (!admission.operator && !isTrustedApiRequest(request, connection.trustedAuthorities))) {
          return new Response('forbidden', { status: 403 })
        }
      }
      if (request.method === 'GET' && (pathname === MUX_EVENTS_PATH || pathname === HOST_EVENTS_PATH)) {
        return new Response('upgrade required', {
          status: 426,
          headers: { connection: 'Upgrade', upgrade: 'websocket' },
        })
      }
      const apiProxy = ctx.get('apiProxy')
      if (apiProxy === undefined) return new Response('not found', { status: 404 })
      return toFetchHandler(apiProxy).fetch(request)
    },
  })
  const route: WebRoute = {
    kind: 'prefix',
    path: API_PATH,
    handler: async (req, res) => {
      // The live service list, not the config snapshot: late-bound surface
      // authorities added after registration reach this fence too.
      if (!isTrustedApiRequest(req, connection.trustedAuthorities)) {
        res.writeHead(403)
        res.end('forbidden')
        return
      }
      // Identity gate: a deny-mode provider rejects requests it cannot
      // authenticate; the admission also scopes every downstream session read
      // through the async context the bridge dispatches in.
      const identity = ctx.get('identity')
      if (identity !== undefined) {
        const admission = identity.admit(req)
        if (admission === undefined) {
          res.writeHead(401, { 'content-type': 'application/json; charset=utf-8' })
          res.end('{"error":"unauthenticated"}')
          return
        }
        await identity.runWith(admission, () => bridge(req, res, fetchHandler, maxRequestBodyBytes))
        return
      }
      await bridge(req, res, fetchHandler, maxRequestBodyBytes)
    },
  }
  ctx.effect(() => ctx.webServer.register(route), 'client-connection: /api route')
  ctx.inject(['apiProxy'], (apiCtx) => {
    assertImageBodyCapacity(apiCtx, maxRequestBodyBytes)
    const downlinks = new WebSocketDownlinks(apiCtx.apiProxy)
    const registerDownlink = (
      path: string,
      handle: (req: IncomingMessage, socket: Duplex, head: Buffer, owner: string | null) => void,
    ): void => {
      apiCtx.effect(() => apiCtx.webServer.registerUpgrade({
        path,
        handler: (req, socket, head) => {
          if (!isTrustedApiRequest(req, connection.trustedAuthorities)) {
            rejectWebSocketUpgrade(socket)
            return
          }
          // The identity gate rejects upgrades a deny-mode provider cannot
          // authenticate; the resolved owner scopes the downlink's streams
          // for the connection's whole lifetime. No identity authority means
          // the legacy operator tier (null owner, unfiltered streams).
          const identity = apiCtx.get('identity')
          let owner: string | null = null
          if (identity !== undefined) {
            const admitted = identity.admit(req, socket)
            if (admitted === undefined) {
              rejectWebSocketUpgrade(socket, 401, 'unauthenticated')
              return
            }
            owner = admitted.owner
          }
          handle(req, socket, head, owner)
        },
      }), `client-connection: ${path} WebSocket`)
    }
    apiCtx.effect(() => () => downlinks.close(), 'client-connection: WebSocket downlinks')
    registerDownlink(MUX_EVENTS_PATH, (req, socket, head, owner) => { downlinks.handleMux(req, socket, head, owner) })
    registerDownlink(HOST_EVENTS_PATH, (req, socket, head, owner) => { downlinks.handleHost(req, socket, head, owner) })
  })
}
