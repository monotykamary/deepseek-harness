/** Browser WebSocket client for the terminal-web binary/output protocol. */

import {
  TERMINAL_WEBSOCKET_PATH,
  type BrowserTerminalClientControl,
  type BrowserTerminalHandshake,
  type BrowserTerminalPlacement,
  type BrowserTerminalServerControl,
  type BrowserTerminalSnapshot,
} from '@monotykamary/dsh-terminal-web/protocol'

/** Factory seam used by browser tests and the production global WebSocket. */
export type TerminalWebSocketFactory = (url: string) => WebSocket

/** Typed Host terminal failure carried in a control frame. */
export class BrowserTerminalError extends Error {
  constructor(readonly code: string, message: string) {
    super(message)
    this.name = 'BrowserTerminalError'
  }
}

function websocketUrl(): string {
  const url = new URL(TERMINAL_WEBSOCKET_PATH, window.location.href)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  return url.href
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseStatus(value: unknown): BrowserTerminalSnapshot['status'] {
  if (!isRecord(value)) throw new BrowserTerminalError('BAD_RESPONSE', 'terminal status is missing')
  if (value.kind === 'running') return { kind: 'running' }
  if (value.kind === 'exited'
    && (typeof value.exitCode === 'number' || value.exitCode === null)
    && (typeof value.signal === 'string' || value.signal === null)) {
    return { kind: 'exited', exitCode: value.exitCode, signal: value.signal }
  }
  throw new BrowserTerminalError('BAD_RESPONSE', 'terminal status is invalid')
}

function parseSnapshot(value: unknown): BrowserTerminalSnapshot {
  if (!isRecord(value) || typeof value.terminalId !== 'string' || typeof value.label !== 'string') {
    throw new BrowserTerminalError('BAD_RESPONSE', 'terminal snapshot is invalid')
  }
  return { terminalId: value.terminalId, label: value.label, status: parseStatus(value.status) }
}

function parseControl(data: unknown): BrowserTerminalServerControl {
  if (typeof data !== 'string') throw new BrowserTerminalError('BAD_RESPONSE', 'terminal control frame must be text')
  let value: unknown
  try {
    value = JSON.parse(data) as unknown
  } catch {
    throw new BrowserTerminalError('BAD_RESPONSE', 'terminal control frame is not JSON')
  }
  if (!isRecord(value)) throw new BrowserTerminalError('BAD_RESPONSE', 'terminal control frame is not an object')
  if (value.type === 'list' && Array.isArray(value.terminals)) {
    return { type: 'list', terminals: value.terminals.map(parseSnapshot) }
  }
  if (value.type === 'ready' && typeof value.replayTruncated === 'boolean') {
    return { type: 'ready', terminal: parseSnapshot(value.terminal), replayTruncated: value.replayTruncated }
  }
  if (value.type === 'exit') return { type: 'exit', status: parseStatus(value.status) }
  if (value.type === 'killed' && typeof value.terminalId === 'string') {
    return { type: 'killed', terminalId: value.terminalId }
  }
  if (value.type === 'pong' && typeof value.sentAt === 'number') return { type: 'pong', sentAt: value.sentAt }
  if (value.type === 'error' && typeof value.code === 'string' && typeof value.message === 'string') {
    return { type: 'error', code: value.code, message: value.message }
  }
  throw new BrowserTerminalError('BAD_RESPONSE', 'unknown terminal control frame')
}

function openSocket(factory: TerminalWebSocketFactory): WebSocket {
  const socket = factory(websocketUrl())
  socket.binaryType = 'arraybuffer'
  return socket
}

function sendHandshake(socket: WebSocket, handshake: BrowserTerminalHandshake): void {
  socket.send(JSON.stringify(handshake))
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new BrowserTerminalError('BAD_RESPONSE', String(error))
}

function requestTerminalControl<Result>(
  factory: TerminalWebSocketFactory,
  handshake: BrowserTerminalHandshake,
  expected: (control: BrowserTerminalServerControl) => Result,
  operation: string,
): Promise<Result> {
  return new Promise((resolve, reject) => {
    const socket = openSocket(factory)
    let settled = false
    const finish = (complete: () => void): void => {
      if (settled) return
      settled = true
      complete()
      socket.close()
    }
    const fail = (error: Error): void => { finish(() => { reject(error) }) }
    socket.addEventListener('open', () => { sendHandshake(socket, handshake) }, { once: true })
    socket.addEventListener('message', (event) => {
      try {
        const control = parseControl(event.data)
        if (control.type === 'error') {
          fail(new BrowserTerminalError(control.code, control.message))
          return
        }
        const result = expected(control)
        finish(() => { resolve(result) })
      } catch (error: unknown) {
        fail(asError(error))
      }
    })
    socket.addEventListener('close', () => {
      if (!settled) fail(new BrowserTerminalError('DISCONNECTED', `${operation} disconnected`))
    }, { once: true })
    socket.addEventListener('error', () => {
      fail(new BrowserTerminalError('DISCONNECTED', `${operation} connection failed`))
    }, { once: true })
  })
}

/**
 * Fetch browser-owned terminals for one placement over a short-lived socket.
 * @param factory - same-origin WebSocket constructor.
 * @param sessionId - selected Agent Session id.
 * @param placement - independent UI terminal placement.
 * @returns validated terminal snapshots after the Host closes the list socket.
 */
export function listBrowserTerminals(
  factory: TerminalWebSocketFactory,
  sessionId: string,
  placement: BrowserTerminalPlacement,
): Promise<readonly BrowserTerminalSnapshot[]> {
  return requestTerminalControl(
    factory,
    { type: 'list', sessionId, placement },
    (control) => {
      if (control.type !== 'list') throw new BrowserTerminalError('BAD_RESPONSE', 'expected terminal list')
      return control.terminals
    },
    'terminal list',
  )
}

/**
 * Kill one detached or exited browser terminal over a short-lived socket.
 * @param factory - same-origin WebSocket constructor.
 * @param sessionId - selected Agent Session id.
 * @param terminalId - persistent terminal to terminate.
 * @returns completion after the Host confirms removal.
 */
export function killBrowserTerminal(
  factory: TerminalWebSocketFactory,
  sessionId: string,
  terminalId: string,
): Promise<void> {
  return requestTerminalControl(
    factory,
    { type: 'kill', sessionId, terminalId },
    (control) => {
      if (control.type !== 'killed') throw new BrowserTerminalError('BAD_RESPONSE', 'expected terminal kill result')
    },
    'terminal kill',
  )
}

/** Callbacks for one attached terminal connection. */
export interface BrowserTerminalConnectionCallbacks {
  /** Raw UTF-8 PTY bytes in wire order. */
  readonly output: (bytes: Uint8Array) => void
  /** Process exit status received before transport closure. */
  readonly exit: (status: BrowserTerminalSnapshot['status']) => void
  /** Terminal session was explicitly killed. */
  readonly killed: (terminalId: string) => void
  /** Established connection closed or failed. */
  readonly disconnected: (error?: BrowserTerminalError) => void
  /** Ping response used by diagnostics. */
  readonly pong?: (sentAt: number) => void
}

/** Live binary-input/output connection for one browser terminal attachment. */
export class BrowserTerminalConnection {
  private closed = false

  private constructor(
    private readonly socket: WebSocket,
    readonly terminal: BrowserTerminalSnapshot,
    readonly replayTruncated: boolean,
  ) {}

  /**
   * Open or attach a terminal and resolve after the Host ready frame.
   * @param factory - same-origin WebSocket constructor.
   * @param handshake - validated open or attach request with initial dimensions.
   * @param callbacks - ordered output and lifecycle sinks installed before the handshake.
   * @returns live connection after terminal identity and replay status arrive.
   */
  static connect(
    factory: TerminalWebSocketFactory,
    handshake: Extract<BrowserTerminalHandshake, { type: 'open' | 'attach' }>,
    callbacks: BrowserTerminalConnectionCallbacks,
  ): Promise<BrowserTerminalConnection> {
    return new Promise((resolve, reject) => {
      const socket = openSocket(factory)
      let live: BrowserTerminalConnection | undefined
      let settled = false
      const rejectBeforeReady = (error: BrowserTerminalError): void => {
        if (settled) return
        settled = true
        socket.close()
        reject(error)
      }
      socket.addEventListener('open', () => { sendHandshake(socket, handshake) }, { once: true })
      socket.addEventListener('message', (event) => {
        if (event.data instanceof ArrayBuffer) {
          if (live !== undefined) callbacks.output(new Uint8Array(event.data))
          return
        }
        try {
          const control = parseControl(event.data)
          if (control.type === 'ready') {
            if (settled) throw new BrowserTerminalError('BAD_RESPONSE', 'duplicate terminal ready frame')
            settled = true
            live = new BrowserTerminalConnection(socket, control.terminal, control.replayTruncated)
            resolve(live)
          } else if (control.type === 'error') {
            const error = new BrowserTerminalError(control.code, control.message)
            if (live === undefined) rejectBeforeReady(error)
            else callbacks.disconnected(error)
          } else if (control.type === 'exit') callbacks.exit(control.status)
          else if (control.type === 'killed') callbacks.killed(control.terminalId)
          else if (control.type === 'pong') callbacks.pong?.(control.sentAt)
        } catch (error: unknown) {
          const failure = error instanceof BrowserTerminalError
            ? error
            : new BrowserTerminalError('BAD_RESPONSE', String(error))
          if (live === undefined) rejectBeforeReady(failure)
          else callbacks.disconnected(failure)
        }
      })
      socket.addEventListener('close', () => {
        if (live === undefined) rejectBeforeReady(new BrowserTerminalError('DISCONNECTED', 'terminal disconnected before ready'))
        else if (!live.closed) callbacks.disconnected()
      }, { once: true })
      socket.addEventListener('error', () => {
        if (live === undefined) rejectBeforeReady(new BrowserTerminalError('DISCONNECTED', 'terminal connection failed'))
        else callbacks.disconnected(new BrowserTerminalError('DISCONNECTED', 'terminal connection failed'))
      }, { once: true })
    })
  }

  /**
   * Send UTF-8 input as a binary WebSocket frame.
   * @param input - exact terminal text without newline conversion.
   */
  write(input: string): void {
    this.requireOpen()
    this.socket.send(new TextEncoder().encode(input))
  }

  /**
   * Resize the backing PTY to the visible xterm grid.
   * @param cols - positive visible columns.
   * @param rows - positive visible rows.
   */
  resize(cols: number, rows: number): void {
    this.sendControl({ type: 'resize', cols, rows })
  }

  /** Terminate the backing persistent terminal session. */
  kill(): void {
    this.sendControl({ type: 'kill' })
  }

  /** Close only this browser attachment, leaving the terminal process alive. */
  close(): void {
    if (this.closed) return
    this.closed = true
    this.socket.close()
  }

  private sendControl(control: BrowserTerminalClientControl): void {
    this.requireOpen()
    this.socket.send(JSON.stringify(control))
  }

  private requireOpen(): void {
    if (this.closed || this.socket.readyState !== WebSocket.OPEN) {
      throw new BrowserTerminalError('DISCONNECTED', 'terminal connection is not open')
    }
  }
}
