/** Trusted full-duplex WebSocket consumer for Agent-owned terminal sessions. */

import { Buffer } from 'node:buffer'
import type { IncomingMessage } from 'node:http'
import type { Duplex } from 'node:stream'
import { Context } from '@monotykamary/cordis'
import type { Agent } from '@monotykamary/dsh-agent'
import type { ConnectionUpgradeAdmission } from '@monotykamary/dsh-client-connection'
import { SessionId } from '@monotykamary/dsh-session'
import { SerialOperationQueue, TerminalError, TerminalSessionId } from '@monotykamary/dsh-terminal'
import type {
  TerminalInteractiveAttachment, TerminalSessionSnapshot, TerminalSessionStatus,
} from '@monotykamary/dsh-terminal'
import z from '@monotykamary/schemastery'
import WebSocket, { WebSocketServer } from 'ws'
import type { RawData } from 'ws'
import { TerminalOutputBatcher } from './output-batcher.ts'
import {
  TERMINAL_WEBSOCKET_PATH,
  type BrowserTerminalClientControl,
  type BrowserTerminalHandshake,
  type BrowserTerminalPlacement,
  type BrowserTerminalServerControl,
  type BrowserTerminalSnapshot,
  type BrowserTerminalStatus,
} from './protocol.ts'

export * from './protocol.ts'

/** Cordis plugin name. */
export const name = 'terminal-web'
/** Host services required before the terminal upgrade route can register. */
export const inject = ['agents', 'connection', 'terminals']

const IDENTIFIER_MAX_CODE_UNITS = 512
const NORMAL_CLOSE = 1000
const POLICY_CLOSE = 1008
const BAD_DATA_CLOSE = 1003
const TRY_AGAIN_CLOSE = 1013

/** Browser terminal transport configuration. */
export interface Config {
  /** Terminal backend type selected for browser-created sessions. */
  backendType?: string
  /** Maximum UTF-8 bytes in one browser input frame. */
  maxInputBytes?: number
  /** Maximum terminal output bytes combined into one WebSocket frame. */
  outputBatchBytes?: number
  /** Trailing idle delay before a partial output batch is sent. */
  outputBatchWindowMs?: number
  /** Maximum duration before a continuous partial output burst is sent. */
  outputStreamThresholdMs?: number
  /** Maximum queued WebSocket bytes before a slow attachment is disconnected. */
  maxBufferedBytes?: number
  /** Maximum wait for the first text handshake frame. */
  handshakeTimeoutMs?: number
  /** Maximum accepted terminal columns. */
  maxCols?: number
  /** Maximum accepted terminal rows. */
  maxRows?: number
}

interface ResolvedConfig {
  readonly backendType: string
  readonly maxInputBytes: number
  readonly outputBatchBytes: number
  readonly outputBatchWindowMs: number
  readonly outputStreamThresholdMs: number
  readonly maxBufferedBytes: number
  readonly handshakeTimeoutMs: number
  readonly maxCols: number
  readonly maxRows: number
}

/** Schemastery configuration for the browser terminal transport. */
export const Config: z<Config> = z.object({
  backendType: z.string().default('shell'),
  maxInputBytes: z.number().default(64 * 1024),
  outputBatchBytes: z.number().default(64 * 1024),
  outputBatchWindowMs: z.number().default(2),
  outputStreamThresholdMs: z.number().default(100),
  maxBufferedBytes: z.number().default(4 * 1024 * 1024),
  handshakeTimeoutMs: z.number().default(10_000),
  maxCols: z.number().default(1_000),
  maxRows: z.number().default(1_000),
})

class TerminalProtocolError extends Error {
  constructor(readonly code: string, message: string) {
    super(message)
    this.name = 'TerminalProtocolError'
  }
}

function resolveConfig(config: Config = {}): ResolvedConfig {
  const resolved: ResolvedConfig = {
    backendType: config.backendType ?? 'shell',
    maxInputBytes: config.maxInputBytes ?? 64 * 1024,
    outputBatchBytes: config.outputBatchBytes ?? 64 * 1024,
    outputBatchWindowMs: config.outputBatchWindowMs ?? 2,
    outputStreamThresholdMs: config.outputStreamThresholdMs ?? 100,
    maxBufferedBytes: config.maxBufferedBytes ?? 4 * 1024 * 1024,
    handshakeTimeoutMs: config.handshakeTimeoutMs ?? 10_000,
    maxCols: config.maxCols ?? 1_000,
    maxRows: config.maxRows ?? 1_000,
  }
  if (resolved.backendType.length === 0) throw new Error('terminal-web: backendType must be non-empty')
  for (const [field, value] of Object.entries(resolved)) {
    if (typeof value === 'number' && (!Number.isSafeInteger(value) || value <= 0)) {
      throw new Error(`terminal-web: ${field} must be a positive safe integer`)
    }
  }
  if (resolved.outputBatchBytes > resolved.maxBufferedBytes) {
    throw new Error('terminal-web: outputBatchBytes must not exceed maxBufferedBytes')
  }
  return resolved
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parsePlacement(value: unknown): BrowserTerminalPlacement {
  if (value === 'bottom' || value === 'right') return value
  throw new TerminalProtocolError('BAD_REQUEST', 'terminal placement must be bottom or right')
}

function parseIdentifier(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > IDENTIFIER_MAX_CODE_UNITS) {
    throw new TerminalProtocolError('BAD_REQUEST', `${field} must be a non-empty bounded string`)
  }
  return value
}

function parseDimension(value: unknown, field: string, maximum: number): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0 || (value as number) > maximum) {
    throw new TerminalProtocolError('BAD_REQUEST', `${field} must be an integer from 1 through ${String(maximum)}`)
  }
  return value as number
}

function parseJson(raw: RawData): Record<string, unknown> {
  let value: unknown
  try {
    value = JSON.parse(rawBuffer(raw).toString('utf8')) as unknown
  } catch {
    throw new TerminalProtocolError('BAD_REQUEST', 'terminal control frame must be JSON')
  }
  if (!isRecord(value)) throw new TerminalProtocolError('BAD_REQUEST', 'terminal control frame must be an object')
  return value
}

function parseHandshake(raw: RawData, config: ResolvedConfig): BrowserTerminalHandshake {
  const value = parseJson(raw)
  const type = value.type
  const sessionId = parseIdentifier(value.sessionId, 'sessionId')
  if (type === 'list') return { type, sessionId, placement: parsePlacement(value.placement) }
  if (type === 'open') {
    return {
      type,
      sessionId,
      placement: parsePlacement(value.placement),
      cols: parseDimension(value.cols, 'cols', config.maxCols),
      rows: parseDimension(value.rows, 'rows', config.maxRows),
    }
  }
  if (type === 'attach') {
    return {
      type,
      sessionId,
      terminalId: parseIdentifier(value.terminalId, 'terminalId'),
      cols: parseDimension(value.cols, 'cols', config.maxCols),
      rows: parseDimension(value.rows, 'rows', config.maxRows),
    }
  }
  if (type === 'kill') {
    return { type, sessionId, terminalId: parseIdentifier(value.terminalId, 'terminalId') }
  }
  throw new TerminalProtocolError('BAD_REQUEST', 'unknown terminal handshake type')
}

function parseControl(raw: RawData, config: ResolvedConfig): BrowserTerminalClientControl {
  const value = parseJson(raw)
  if (value.type === 'resize') {
    return {
      type: 'resize',
      cols: parseDimension(value.cols, 'cols', config.maxCols),
      rows: parseDimension(value.rows, 'rows', config.maxRows),
    }
  }
  if (value.type === 'kill') return { type: 'kill' }
  if (value.type === 'ping' && typeof value.sentAt === 'number' && Number.isFinite(value.sentAt)) {
    return { type: 'ping', sentAt: value.sentAt }
  }
  throw new TerminalProtocolError('BAD_REQUEST', 'unknown terminal control type')
}

function rawBuffer(raw: RawData): Buffer {
  if (Buffer.isBuffer(raw)) return raw
  if (raw instanceof ArrayBuffer) return Buffer.from(raw)
  if (Array.isArray(raw)) return Buffer.concat(raw)
  throw new TerminalProtocolError('BAD_REQUEST', 'unsupported WebSocket data frame')
}

function projectStatus(status: TerminalSessionStatus): BrowserTerminalStatus {
  return status.kind === 'running'
    ? { kind: 'running' }
    : { kind: 'exited', exitCode: status.exitCode, signal: status.signal }
}

function placementPrefix(placement: BrowserTerminalPlacement): string {
  return `web-${placement}-`
}

function browserPlacement(snapshot: TerminalSessionSnapshot): BrowserTerminalPlacement | undefined {
  if (snapshot.name?.startsWith(placementPrefix('bottom')) === true) return 'bottom'
  if (snapshot.name?.startsWith(placementPrefix('right')) === true) return 'right'
  return undefined
}

function snapshotFor(snapshot: TerminalSessionSnapshot, placement: BrowserTerminalPlacement): BrowserTerminalSnapshot {
  const prefix = placementPrefix(placement)
  const suffix = snapshot.name?.startsWith(prefix) === true ? snapshot.name.slice(prefix.length) : ''
  return {
    terminalId: snapshot.sessionId,
    label: suffix === '' ? `Terminal ${snapshot.sessionId}` : `Terminal ${suffix}`,
    status: projectStatus(snapshot.status),
  }
}

function sendControl(socket: WebSocket, control: BrowserTerminalServerControl): Promise<void> {
  return new Promise((resolve, reject) => {
    if (socket.readyState !== WebSocket.OPEN) {
      reject(new Error('terminal WebSocket closed before control delivery'))
      return
    }
    socket.send(JSON.stringify(control), (error) => {
      if (error == null) resolve()
      else reject(error)
    })
  })
}

function sendBinary(socket: WebSocket, bytes: Buffer, maxBufferedBytes: number): Promise<void> {
  return new Promise((resolve, reject) => {
    if (socket.readyState !== WebSocket.OPEN) {
      reject(new Error('terminal WebSocket closed before output delivery'))
      return
    }
    if (socket.bufferedAmount + bytes.byteLength > maxBufferedBytes) {
      socket.close(TRY_AGAIN_CLOSE, 'terminal output backpressure')
      reject(new Error('terminal WebSocket output exceeded its backpressure limit'))
      return
    }
    socket.send(bytes, { binary: true }, (error) => {
      if (error == null) resolve()
      else reject(error)
    })
  })
}

function nextBrowserName(snapshots: readonly TerminalSessionSnapshot[], placement: BrowserTerminalPlacement): string {
  const prefix = placementPrefix(placement)
  const occupied = new Set(snapshots.flatMap((snapshot) => {
    if (snapshot.name?.startsWith(prefix) !== true) return []
    const value = Number(snapshot.name.slice(prefix.length))
    return Number.isSafeInteger(value) && value > 0 ? [value] : []
  }))
  let next = 1
  while (occupied.has(next)) next += 1
  return `${prefix}${String(next)}`
}

/** Full-duplex terminal WebSocket gateway with connection and attachment ownership. */
export class BrowserTerminalGateway {
  private readonly server: WebSocketServer
  private readonly connections = new Set<Promise<void>>()
  private readonly config: ResolvedConfig
  private disposing = false

  /** @param ctx - Host context carrying the Agent registry. @param config - validated transport limits. */
  constructor(private readonly ctx: Context, config: Config = {}) {
    this.config = resolveConfig(config)
    this.server = new WebSocketServer({ noServer: true, perMessageDeflate: false, maxPayload: this.config.maxInputBytes })
  }

  /**
   * Negotiate and serve one already admitted raw HTTP upgrade.
   * @param request - trusted same-origin HTTP upgrade request.
   * @param socket - raw duplex socket transferred to ws on success.
   * @param head - bytes already read past the HTTP headers.
   * @param admission - identity owner/operator facts resolved by Connection.
   */
  handleUpgrade(
    request: IncomingMessage,
    socket: Duplex,
    head: Buffer,
    admission: ConnectionUpgradeAdmission,
  ): void {
    if (this.disposing) {
      socket.destroy()
      return
    }
    this.server.handleUpgrade(request, socket, head, (websocket) => {
      const connection = this.serve(websocket, admission)
      this.connections.add(connection)
      void connection.finally(() => { this.connections.delete(connection) })
    })
  }

  /** Terminate accepted sockets and await every attachment cleanup. */
  async close(): Promise<void> {
    this.disposing = true
    for (const socket of this.server.clients) socket.terminate()
    await new Promise<void>((resolve, reject) => {
      this.server.close((error) => {
        if (error !== undefined) {
          reject(error)
          return
        }
        resolve()
      })
    })
    await Promise.all(this.connections)
  }

  private async serve(socket: WebSocket, admission: ConnectionUpgradeAdmission): Promise<void> {
    socket.binaryType = 'arraybuffer'
    socket.on('error', () => {})
    try {
      const handshake = await this.waitForHandshake(socket)
      const { agent, terminals } = this.resolveAgent(handshake.sessionId, admission)
      if (handshake.type === 'list') {
        const prefix = placementPrefix(handshake.placement)
        const visible = terminals.list(agent).filter(snapshot => snapshot.name?.startsWith(prefix) === true)
        await sendControl(socket, {
          type: 'list', terminals: visible.map(snapshot => snapshotFor(snapshot, handshake.placement)),
        })
        socket.close(NORMAL_CLOSE)
        return
      }
      if (handshake.type === 'kill') {
        await terminals.kill(agent, TerminalSessionId(handshake.terminalId), 'browser request')
        await sendControl(socket, { type: 'killed', terminalId: handshake.terminalId })
        socket.close(NORMAL_CLOSE)
        return
      }

      let terminal: TerminalSessionSnapshot | undefined
      let placement: BrowserTerminalPlacement | undefined
      if (handshake.type === 'open') {
        placement = handshake.placement
        terminal = await terminals.spawn(agent, {
          type: this.config.backendType,
          name: nextBrowserName(terminals.list(agent), placement),
          ...agent.session.header.cwd === undefined ? {} : { cwd: agent.session.header.cwd },
          interactive: true,
          rows: handshake.rows,
          cols: handshake.cols,
        })
      } else {
        terminal = terminals.list(agent).find(snapshot => snapshot.sessionId === handshake.terminalId)
        placement = terminal === undefined ? undefined : browserPlacement(terminal)
      }
      if (terminal === undefined || placement === undefined) {
        throw new TerminalProtocolError('NO_SESSION', 'browser terminal session not found')
      }
      const attachment = terminals.attach(agent, TerminalSessionId(terminal.sessionId))
      await attachment.resize(handshake.cols, handshake.rows)
      await sendControl(socket, {
        type: 'ready',
        terminal: snapshotFor(terminal, placement),
        replayTruncated: attachment.replayTruncated,
      })
      await this.serveAttachment(socket, agent, terminal.sessionId, attachment)
    } catch (error: unknown) {
      await this.reportFailure(socket, error)
    } finally {
      if (socket.readyState === WebSocket.OPEN) socket.close()
    }
  }

  private resolveAgent(sessionId: string, admission: ConnectionUpgradeAdmission): {
    agent: Agent
    terminals: Context['terminals']
  } {
    const agent = this.ctx.agents.get(SessionId(sessionId))
    if (agent === undefined || (admission.owner !== null && agent.session.header.owner !== admission.owner)) {
      throw new TerminalProtocolError('NO_SESSION', 'session not found')
    }
    return { agent, terminals: this.ctx.terminals }
  }

  private waitForHandshake(socket: WebSocket): Promise<BrowserTerminalHandshake> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup()
        reject(new TerminalProtocolError('HANDSHAKE_TIMEOUT', 'terminal handshake timed out'))
      }, this.config.handshakeTimeoutMs)
      const cleanup = (): void => {
        clearTimeout(timer)
        socket.off('message', onMessage)
        socket.off('close', onClose)
      }
      const onMessage = (raw: RawData, binary: boolean): void => {
        cleanup()
        if (binary) {
          reject(new TerminalProtocolError('BAD_REQUEST', 'first terminal frame must be text'))
          return
        }
        try {
          resolve(parseHandshake(raw, this.config))
        } catch (error: unknown) {
          reject(error instanceof Error ? error : new Error(String(error)))
        }
      }
      const onClose = (): void => {
        cleanup()
        reject(new Error('terminal WebSocket closed before its handshake'))
      }
      socket.once('message', onMessage)
      socket.once('close', onClose)
    })
  }

  private async serveAttachment(
    socket: WebSocket,
    agent: Agent,
    terminalId: string,
    attachment: TerminalInteractiveAttachment,
  ): Promise<void> {
    let settled = false
    const operations = new SerialOperationQueue()
    const connectionDone = Promise.withResolvers<void>()
    const settle = (): void => {
      if (settled) return
      settled = true
      connectionDone.resolve()
    }
    const fail = (error: unknown): void => {
      if (settled) return
      settled = true
      connectionDone.reject(error)
    }
    const output = new TerminalOutputBatcher(
      this.config,
      bytes => sendBinary(socket, bytes, this.config.maxBufferedBytes),
      fail,
    )
    const enqueue = (operation: () => Promise<void>): void => {
      void operations.enqueue(operation).catch(fail)
    }
    const onData = (chunk: Buffer): void => { output.push(chunk) }
    const onEnd = (): void => {
      void output.finish().then(async () => {
        if (socket.readyState === WebSocket.OPEN) {
          await sendControl(socket, { type: 'exit', status: projectStatus(attachment.status()) })
        }
        settle()
      }).catch(fail)
    }
    const onError = (error: Error): void => { fail(error) }
    const onClose = (): void => { settle() }
    const onMessage = (raw: RawData, binary: boolean): void => {
      if (binary) {
        const bytes = rawBuffer(raw)
        if (bytes.byteLength > this.config.maxInputBytes) {
          socket.close(BAD_DATA_CLOSE, 'terminal input too large')
          return
        }
        let input: string
        try {
          input = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
        } catch {
          socket.close(BAD_DATA_CLOSE, 'terminal input must be UTF-8')
          return
        }
        enqueue(() => attachment.write(input))
        return
      }
      try {
        const control = parseControl(raw, this.config)
        if (control.type === 'resize') enqueue(() => attachment.resize(control.cols, control.rows))
        else if (control.type === 'kill') {
          enqueue(async () => {
            await this.ctx.terminals.kill(agent, TerminalSessionId(terminalId), 'browser request')
            if (socket.readyState === WebSocket.OPEN) await sendControl(socket, { type: 'killed', terminalId })
            settle()
          })
        } else {
          void sendControl(socket, { type: 'pong', sentAt: control.sentAt }).catch(fail)
        }
      } catch (error: unknown) {
        fail(error)
      }
    }

    attachment.output.on('data', onData)
    attachment.output.once('end', onEnd)
    attachment.output.once('error', onError)
    socket.on('message', onMessage)
    socket.once('close', onClose)
    try {
      await connectionDone.promise
      await operations.idle()
    } finally {
      output.abort()
      socket.off('message', onMessage)
      socket.off('close', onClose)
      attachment.output.off('data', onData)
      attachment.output.off('end', onEnd)
      attachment.output.off('error', onError)
      attachment.close()
    }
  }

  private async reportFailure(socket: WebSocket, error: unknown): Promise<void> {
    const code = error instanceof TerminalProtocolError
      ? error.code
      : error instanceof TerminalError
        ? error.code
        : 'INTERNAL'
    const message = error instanceof Error ? error.message : String(error)
    if (socket.readyState === WebSocket.OPEN) {
      try {
        await sendControl(socket, { type: 'error', code, message })
      } catch {
        // Socket loss won the race; no downstream remains to receive the failure frame.
      }
      socket.close(code === 'BAD_REQUEST' ? POLICY_CLOSE : TRY_AGAIN_CLOSE, code)
    }
  }
}

/** Register the trusted browser terminal WebSocket consumer. */
export function apply(ctx: Context, config: Config = {}): void {
  const gateway = new BrowserTerminalGateway(ctx, config)
  ctx.connection.upgrade(
    TERMINAL_WEBSOCKET_PATH,
    (request, socket, head, admission) => { gateway.handleUpgrade(request, socket, head, admission) },
    { authority: 'trusted-host' },
  )
  ctx.effect(() => () => gateway.close(), 'terminal-web: close accepted sockets')
}
