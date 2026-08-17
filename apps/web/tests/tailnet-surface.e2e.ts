/**
 * The tailnet remote-access flow: `--tailnet` resolves the tailscale serve
 * surface after the tree settles and publishes the derived DNS name into the
 * /api browser-trust fence, so a browser reaching the server through
 * `https://<node>.ts.net` lists and creates sessions instead of 403ing.
 * A PATH-shimmed fake `tailscale` binary drives the derivation; no model
 * traffic runs.
 */

import { mkdtempSync, writeFileSync, chmodSync, rmSync } from 'node:fs'
import { request as httpRequest } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { launchWebScaffold, type WebScaffold } from './scaffold.ts'

const DNS_NAME = 'node.tail.ts.net'

/** The fake binary's answer for `tailscale serve status --json`: an HTTPS TCP listener on 3080. */
const SERVE_STATUS = JSON.stringify({ TCP: { [`${DNS_NAME}:3080`]: { HTTPS: true } } })
/** The fake binary's answer for `tailscale status --json`. */
const SELF_STATUS = JSON.stringify({ Self: { DNSName: `${DNS_NAME}.`, Online: true } })

let scaffold: WebScaffold | undefined
let binDir: string | undefined
let originalPath: string | undefined

/** POST one client-request envelope to the bound server under the given Host authority. */
function postSessionList(authority: string): Promise<{ status: number; ok?: boolean }> {
  // node:http honors an explicit host header (fetch derives Host from the
  // URL and ignores an override), so this exercises the exact wire shape a
  // tailnet browser sends: socket to loopback, Host = the ts.net name.
  const url = new URL(`${scaffold!.baseUrl}/api/session.list`)
  const body = JSON.stringify({
    type: 'client-request',
    rpcId: 'rpc-tailnet-surface-e2e',
    method: 'session.list',
    payload: {},
  })
  return new Promise((resolve, reject) => {
    const request = httpRequest({
      host: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'POST',
      headers: {
        host: authority,
        origin: `https://${authority}`,
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(body),
      },
    }, (response) => {
      const chunks: Buffer[] = []
      response.on('data', (chunk: Buffer) => { chunks.push(chunk) })
      response.on('end', () => {
        let ok: boolean | undefined
        try {
          ok = (JSON.parse(Buffer.concat(chunks).toString()) as { result?: { ok?: boolean } }).result?.ok
        } catch {
          ok = undefined
        }
        resolve(ok === undefined ? { status: response.statusCode ?? 0 } : { status: response.statusCode ?? 0, ok })
      })
    })
    request.on('error', reject)
    request.end(body)
  })
}

beforeAll(async () => {
  // The in-process host resolves the tailnet surface exactly once, right
  // after its Loader tree settles; the shim must front PATH for that whole
  // window.
  binDir = mkdtempSync(join(tmpdir(), 'dsh-tailnet-shim-'))
  writeFileSync(join(binDir, 'tailscale'), [
    '#!/bin/sh',
    'if [ "$1" = "serve" ] && [ "$2" = "status" ] && [ "$3" = "--json" ]; then',
    `  printf '%s' '${SERVE_STATUS}'`,
    'elif [ "$1" = "status" ] && [ "$2" = "--json" ]; then',
    `  printf '%s' '${SELF_STATUS}'`,
    'else',
    '  printf "unexpected args: %s" "$*" >&2',
    '  exit 1',
    'fi',
    '',
  ].join('\n'))
  chmodSync(join(binDir, 'tailscale'), 0o755)
  originalPath = process.env.PATH
  process.env.PATH = `${binDir}:${originalPath ?? ''}`
  scaffold = await launchWebScaffold({ tailnetSurface: true })
}, 120_000)

afterAll(async () => {
  await scaffold?.close()
  scaffold = undefined
  if (originalPath !== undefined) process.env.PATH = originalPath
  if (binDir !== undefined) rmSync(binDir, { recursive: true, force: true })
  binDir = undefined
})

describe('tailnet surface', () => {
  it('publishes the derived tailscale DNS name into the /api trust fence', async () => {
    await expect.poll(async () => {
      const result = await postSessionList(DNS_NAME)
      return result.status
    }, { timeout: 15_000 }).toBe(200)
    const listed = await postSessionList(DNS_NAME)
    expect(listed.ok).toBe(true)
  }, 30_000)

  it('still refuses an authority the fence did not derive', async () => {
    const refused = await postSessionList('evil.example')
    expect(refused.status).toBe(403)
    expect(refused.ok).toBeUndefined()
  })
})
