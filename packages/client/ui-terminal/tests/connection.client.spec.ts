// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  BrowserTerminalConnection, BrowserTerminalError, killBrowserTerminal, listBrowserTerminals,
} from '../src/client/connection.ts'

class FakeWebSocket extends EventTarget {
  static readonly OPEN = 1
  readonly sent: unknown[] = []
  readyState = FakeWebSocket.OPEN
  binaryType: BinaryType = 'blob'
  close = vi.fn(() => { this.readyState = 3 })

  send(data: unknown): void {
    this.sent.push(data)
  }

  open(): void {
    this.dispatchEvent(new Event('open'))
  }

  message(data: unknown): void {
    this.dispatchEvent(new MessageEvent('message', { data }))
  }

  disconnect(): void {
    this.readyState = 3
    this.dispatchEvent(new Event('close'))
  }

  fail(): void {
    this.dispatchEvent(new Event('error'))
  }
}

let sockets: FakeWebSocket[]
let urls: string[]
const factory = (url: string): WebSocket => {
  urls.push(url)
  const socket = new FakeWebSocket()
  sockets.push(socket)
  return socket as unknown as WebSocket
}

function control(socket: FakeWebSocket, value: unknown): void {
  socket.message(JSON.stringify(value))
}

beforeEach(() => {
  sockets = []
  urls = []
  vi.stubGlobal('WebSocket', FakeWebSocket)
  window.history.replaceState({}, '', '/chat')
})

describe('terminal WebSocket short operations', () => {
  it('lists validated snapshots over the same-origin secure path', async () => {
    const result = listBrowserTerminals(factory, 'session-1', 'bottom')
    const socket = sockets[0]
    expect(socket?.binaryType).toBe('arraybuffer')
    const expectedUrl = new URL('/api/terminal', window.location.href)
    expectedUrl.protocol = expectedUrl.protocol === 'https:' ? 'wss:' : 'ws:'
    expect(urls).toEqual([expectedUrl.href])
    socket?.open()
    expect(socket?.sent).toEqual([JSON.stringify({ type: 'list', sessionId: 'session-1', placement: 'bottom' })])
    control(socket!, {
      type: 'list',
      terminals: [
        { terminalId: 'terminal-1', label: 'Terminal 1', status: { kind: 'running' } },
        { terminalId: 'terminal-2', label: 'Terminal 2', status: { kind: 'exited', exitCode: 2, signal: null } },
      ],
    })
    await expect(result).resolves.toEqual([
      { terminalId: 'terminal-1', label: 'Terminal 1', status: { kind: 'running' } },
      { terminalId: 'terminal-2', label: 'Terminal 2', status: { kind: 'exited', exitCode: 2, signal: null } },
    ])
    expect(socket?.close).toHaveBeenCalledOnce()
  })

  it('kills a detached terminal and rejects Host, malformed, unexpected, and disconnected results', async () => {
    const killed = killBrowserTerminal(factory, 'session-1', 'terminal-3')
    sockets[0]?.open()
    expect(sockets[0]?.sent[0]).toBe(JSON.stringify({
      type: 'kill', sessionId: 'session-1', terminalId: 'terminal-3',
    }))
    control(sockets[0]!, { type: 'killed', terminalId: 'terminal-3' })
    await expect(killed).resolves.toBeUndefined()

    const hostError = listBrowserTerminals(factory, 'session-1', 'right')
    sockets[1]?.open()
    control(sockets[1]!, { type: 'error', code: 'NO_SESSION', message: 'missing' })
    await expect(hostError).rejects.toMatchObject({ code: 'NO_SESSION', message: 'missing' })

    const malformed = listBrowserTerminals(factory, 'session-1', 'right')
    sockets[2]?.open()
    sockets[2]?.message('{')
    await expect(malformed).rejects.toMatchObject({ code: 'BAD_RESPONSE' })

    const unexpected = killBrowserTerminal(factory, 'session-1', 'terminal-3')
    sockets[3]?.open()
    control(sockets[3]!, { type: 'pong', sentAt: 1 })
    await expect(unexpected).rejects.toThrow('expected terminal kill result')

    const disconnected = listBrowserTerminals(factory, 'session-1', 'right')
    sockets[4]?.disconnect()
    await expect(disconnected).rejects.toMatchObject({ code: 'DISCONNECTED' })

    const failed = listBrowserTerminals(factory, 'session-1', 'right')
    sockets[5]?.fail()
    await expect(failed).rejects.toThrow('connection failed')
  })

  it.each([
    [{ type: 'list', terminals: [{ terminalId: 1, label: 'bad', status: { kind: 'running' } }] }],
    [{ type: 'list', terminals: [{ terminalId: 'id', label: 'bad', status: { kind: 'other' } }] }],
    [{ type: 'list', terminals: [{ terminalId: 'id', label: 'bad', status: { kind: 'exited', exitCode: '2', signal: null } }] }],
    [null],
  ])('rejects invalid list response %#', async (response) => {
    const result = listBrowserTerminals(factory, 'session-1', 'right')
    sockets[0]?.open()
    control(sockets[0]!, response)
    await expect(result).rejects.toMatchObject({ code: 'BAD_RESPONSE' })
  })
})

describe('BrowserTerminalConnection', () => {
  it('carries ready, binary output, input, resize, ping, exit, and kill controls', async () => {
    const output = vi.fn()
    const exit = vi.fn()
    const killed = vi.fn()
    const disconnected = vi.fn()
    const pong = vi.fn()
    const connected = BrowserTerminalConnection.connect(factory, {
      type: 'open', sessionId: 'session-1', placement: 'right', cols: 80, rows: 24,
    }, { output, exit, killed, disconnected, pong })
    const socket = sockets[0]!
    socket.open()
    expect(socket.sent[0]).toBe(JSON.stringify({
      type: 'open', sessionId: 'session-1', placement: 'right', cols: 80, rows: 24,
    }))
    control(socket, {
      type: 'ready',
      terminal: { terminalId: 'terminal-1', label: 'Terminal 1', status: { kind: 'running' } },
      replayTruncated: true,
    })
    const live = await connected
    expect(live.terminal.terminalId).toBe('terminal-1')
    expect(live.replayTruncated).toBe(true)

    const bytes = new Uint8Array([1, 2, 3])
    socket.message(bytes.buffer)
    expect(output).toHaveBeenCalledWith(expect.objectContaining({ byteLength: 3 }))
    live.write('ls\n')
    expect(socket.sent.at(-1)).toEqual(new TextEncoder().encode('ls\n'))
    live.resize(120, 40)
    expect(socket.sent.at(-1)).toBe(JSON.stringify({ type: 'resize', cols: 120, rows: 40 }))
    live.kill()
    expect(socket.sent.at(-1)).toBe(JSON.stringify({ type: 'kill' }))

    control(socket, { type: 'pong', sentAt: 99 })
    control(socket, { type: 'exit', status: { kind: 'exited', exitCode: 0, signal: null } })
    control(socket, { type: 'killed', terminalId: 'terminal-1' })
    expect(pong).toHaveBeenCalledWith(99)
    expect(exit).toHaveBeenCalledWith({ kind: 'exited', exitCode: 0, signal: null })
    expect(killed).toHaveBeenCalledWith('terminal-1')

    live.close()
    live.close()
    socket.disconnect()
    expect(socket.close).toHaveBeenCalledOnce()
    expect(disconnected).not.toHaveBeenCalled()
    expect(() => { live.write('late') }).toThrow(BrowserTerminalError)
  })

  it('rejects before ready and reports invalid frames after ready', async () => {
    const callbacks = { output: vi.fn(), exit: vi.fn(), killed: vi.fn(), disconnected: vi.fn() }
    const refused = BrowserTerminalConnection.connect(factory, {
      type: 'attach', sessionId: 'session-1', terminalId: 'missing', cols: 80, rows: 24,
    }, callbacks)
    sockets[0]?.open()
    control(sockets[0]!, { type: 'error', code: 'NO_SESSION', message: 'missing' })
    await expect(refused).rejects.toMatchObject({ code: 'NO_SESSION' })

    const disconnected = BrowserTerminalConnection.connect(factory, {
      type: 'attach', sessionId: 'session-1', terminalId: 'terminal-1', cols: 80, rows: 24,
    }, callbacks)
    sockets[1]?.disconnect()
    await expect(disconnected).rejects.toMatchObject({ code: 'DISCONNECTED' })

    const failed = BrowserTerminalConnection.connect(factory, {
      type: 'attach', sessionId: 'session-1', terminalId: 'terminal-1', cols: 80, rows: 24,
    }, callbacks)
    sockets[2]?.fail()
    await expect(failed).rejects.toThrow('connection failed')

    const livePromise = BrowserTerminalConnection.connect(factory, {
      type: 'attach', sessionId: 'session-1', terminalId: 'terminal-1', cols: 80, rows: 24,
    }, callbacks)
    sockets[3]?.open()
    control(sockets[3]!, {
      type: 'ready', terminal: { terminalId: 'terminal-1', label: 'Terminal 1', status: { kind: 'running' } }, replayTruncated: false,
    })
    await livePromise
    sockets[3]?.message('not json')
    expect(callbacks.disconnected).toHaveBeenCalledWith(expect.objectContaining({ code: 'BAD_RESPONSE' }))
  })

  it('reports unexpected close and error after readiness', async () => {
    const disconnected = vi.fn()
    const callbacks = { output: vi.fn(), exit: vi.fn(), killed: vi.fn(), disconnected }
    const ready = BrowserTerminalConnection.connect(factory, {
      type: 'attach', sessionId: 'session-1', terminalId: 'terminal-1', cols: 80, rows: 24,
    }, callbacks)
    sockets[0]?.open()
    control(sockets[0]!, {
      type: 'ready', terminal: { terminalId: 'terminal-1', label: 'Terminal 1', status: { kind: 'running' } }, replayTruncated: false,
    })
    await ready
    sockets[0]?.fail()
    expect(disconnected).toHaveBeenCalledWith(expect.objectContaining({ code: 'DISCONNECTED' }))
    sockets[0]?.disconnect()
    expect(disconnected).toHaveBeenCalledWith()
  })
})
