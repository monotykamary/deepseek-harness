/** Host-only full-duplex WebSocket registration types. */

import type { IncomingMessage } from 'node:http'
import type { Duplex } from 'node:stream'

/** Identity admitted for one trusted WebSocket upgrade. */
export interface ConnectionUpgradeAdmission {
  /** Null grants the operator tier; a string restricts access to that Session owner. */
  readonly owner: string | null
  /** Whether an operator bearer token admitted the request. */
  readonly operator: boolean
}

/** Handler owning protocol negotiation and the upgraded socket after Connection admits it. */
export type ConnectionUpgradeHandler = (
  request: IncomingMessage,
  socket: Duplex,
  head: Buffer,
  admission: ConnectionUpgradeAdmission,
) => void | Promise<void>

declare module './rpc.ts' {
  interface HostConnectionHandle {
    /**
     * Register one exact WebSocket pathname behind the shared Host/Origin and identity fences.
     * @param path - absolute upgrade pathname.
     * @param handler - protocol owner receiving the admitted identity and raw socket.
     * @param options - trusted-host or loopback-only reachability.
     * @returns asynchronous disposer removing exactly this upgrade route.
     */
    upgrade(
      path: string,
      handler: ConnectionUpgradeHandler,
      options: import('./rpc.ts').ConnectionRpcHandlerOptions,
    ): () => Promise<void>
  }
}
