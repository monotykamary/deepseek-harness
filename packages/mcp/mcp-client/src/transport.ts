/**
 * Transport factory: creates the appropriate MCP transport based on the
 * plugin's resolved config. Stdio spawns a child process (with credential
 * scrubbing); Streamable HTTP connects to a URL.
 *
 * @module
 */

import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { scrubbedParentEnv } from '@monotykamary/dsh-subprocess'
import type { Config } from './index.ts'

/**
 * Serialize a transport's sends so at most one write waits on child-stdin
 * backpressure at a time. The MCP SDK's stdio client registers one drain
 * listener per concurrent send while the pipe is saturated, with no queue,
 * so parallel tool fan-out against one server crosses Node's 10-listener
 * ceiling and emits MaxListenersExceededWarning for the child pipe.
 * JSON-RPC over stdio is ordered, so serializing preserves wire semantics;
 * a rejected send settles its own caller without stalling the sends queued
 * behind it.
 * @param transport - the freshly created transport to guard in place.
 * @returns the same transport instance with its send serialized.
 */
export function serializeSends(transport: Transport): Transport {
  const send = transport.send.bind(transport)
  let chain: Promise<void> = Promise.resolve()
  transport.send = (...args) => {
    const run = chain.then(() => send(...(args as Parameters<typeof send>)))
    /* the chain tail must survive a rejected send; each caller owns its error */
    chain = run.catch(() => {})
    return run
  }
  return transport
}

/**
 * The subprocess seam's scrubbed parent env (credential-shaped and stale
 * `DSH_*` names dropped), plus the spec's explicit env. The MCP SDK owns the
 * actual spawn, so this transport shares the scrub definition rather than the
 * spawn path.
 */
function buildChildEnv(extra: Record<string, string>): Record<string, string> {
  return { ...scrubbedParentEnv(), ...extra }
}

/**
 * Create an MCP transport from the resolved plugin config.
 *
 * @param config - Resolved plugin config discriminated on `transport`.
 * @returns A connected-ready MCP Transport (stdio or Streamable HTTP).
 */
export function createTransport(config: Config): Transport {
  switch (config.transport) {
    case 'stdio':
      return serializeSends(new StdioClientTransport({
        command: config.command,
        args: config.args,
        env: buildChildEnv(config.env),
        cwd: config.cwd,
      }))
    case 'streamable-http':
      // The MCP SDK's StreamableHTTPClientTransport has optional callback
      // properties typed without `| undefined` (exactOptionalPropertyTypes
      // mismatch with the Transport interface); the SDK constructed the
      // object, so the cast records only that widening.
      return new StreamableHTTPClientTransport(
        new URL(config.url),
        { requestInit: { headers: config.headers } },
      ) as Transport
  }
}
