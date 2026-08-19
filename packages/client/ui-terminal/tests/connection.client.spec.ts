// @vitest-environment jsdom
import {
  TERMINAL_ATOMIC_OUTPUT_FRAME_MAX_BYTES,
} from '@monotykamary/dsh-terminal-web/protocol'
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

  it('uses the secure WebSocket scheme and ignores close or error races after settlement', async () => {
    vi.stubGlobal('window', { location: { href: 'https://terminal.example/chat' } })
    const result = listBrowserTerminals(factory, 'session-1', 'bottom')
    const socket = sockets[0]!
    expect(urls[0]).toBe('wss://terminal.example/api/terminal')
    socket.open()
    control(socket, { type: 'list', terminals: [] })
    await expect(result).resolves.toEqual([])
    socket.fail()
    socket.disconnect()
    vi.unstubAllGlobals()
    vi.stubGlobal('WebSocket', FakeWebSocket)
    window.history.replaceState({}, '', '/chat')
    expect(socket.close).toHaveBeenCalledOnce()
  })

  it('rejects non-text and unexpected list responses after the handshake', async () => {
    const binary = listBrowserTerminals(factory, 'session-1', 'bottom')
    sockets[0]?.message(new ArrayBuffer(0))
    await expect(binary).rejects.toMatchObject({ code: 'BAD_RESPONSE' })

    const unexpected = listBrowserTerminals(factory, 'session-1', 'bottom')
    sockets[1]?.open()
    control(sockets[1]!, { type: 'killed', terminalId: 'terminal-1' })
    await expect(unexpected).rejects.toThrow('expected terminal list')
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
    sockets[4]?.disconnect()
    sockets[5]?.fail()
  })

  it.each([
    [{ type: 'list', terminals: [{ terminalId: 1, label: 'bad', status: { kind: 'running' } }] }],
    [{ type: 'list', terminals: [{ terminalId: 'id', label: 'bad' }] }],
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

  it('commits bracketed transport chunks as one output write', async () => {
    const output = vi.fn()
    const callbacks = { output, exit: vi.fn(), killed: vi.fn(), disconnected: vi.fn() }
    const connected = BrowserTerminalConnection.connect(factory, {
      type: 'attach', sessionId: 'session-1', terminalId: 'terminal-1', cols: 80, rows: 24,
    }, callbacks)
    const socket = sockets[0]!
    socket.message(new Uint8Array([9]).buffer)
    control(socket, { type: 'output-frame-start' })
    control(socket, { type: 'output-frame-end' })
    socket.open()
    control(socket, {
      type: 'ready',
      terminal: { terminalId: 'terminal-1', label: 'Terminal 1', status: { kind: 'running' } },
      replayTruncated: false,
    })
    const live = await connected

    control(socket, { type: 'pong', sentAt: 1 })
    control(socket, { type: 'output-frame-start' })
    socket.message(new Uint8Array([1]).buffer)
    control(socket, { type: 'output-frame-start' })
    socket.message(new Uint8Array([2, 3]).buffer)
    expect(output).not.toHaveBeenCalled()
    control(socket, { type: 'output-frame-end' })
    expect(output).toHaveBeenCalledOnce()
    expect(Array.from(output.mock.calls[0]?.[0] as Uint8Array)).toEqual([1, 2, 3])

    control(socket, { type: 'output-frame-start' })
    socket.message(new Uint8Array([4]).buffer)
    control(socket, { type: 'output-frame-end' })
    expect(Array.from(output.mock.calls[1]?.[0] as Uint8Array)).toEqual([4])

    control(socket, { type: 'output-frame-start' })
    control(socket, { type: 'output-frame-end' })
    expect(output).toHaveBeenCalledTimes(2)

    live.close()
    control(socket, { type: 'output-frame-start' })
    control(socket, { type: 'output-frame-end' })
    socket.message(new Uint8Array([5]).buffer)
    expect(output).toHaveBeenCalledTimes(2)
  })

  it('disconnects a browser attachment whose staged atomic frame exceeds the wire bound', async () => {
    const output = vi.fn()
    const disconnected = vi.fn()
    const callbacks = { output, exit: vi.fn(), killed: vi.fn(), disconnected }
    const connected = BrowserTerminalConnection.connect(factory, {
      type: 'attach', sessionId: 'session-1', terminalId: 'terminal-1', cols: 80, rows: 24,
    }, callbacks)
    const socket = sockets[0]!
    socket.open()
    control(socket, {
      type: 'ready',
      terminal: { terminalId: 'terminal-1', label: 'Terminal 1', status: { kind: 'running' } },
      replayTruncated: false,
    })
    const live = await connected

    control(socket, { type: 'output-frame-start' })
    socket.message(new ArrayBuffer(TERMINAL_ATOMIC_OUTPUT_FRAME_MAX_BYTES))
    socket.message(new ArrayBuffer(1))
    expect(disconnected).toHaveBeenCalledWith(expect.objectContaining({
      code: 'OUTPUT_FRAME_OVERFLOW',
      message: 'terminal atomic output frame exceeded its size limit',
    }))
    expect(socket.close).toHaveBeenCalledOnce()
    expect(output).not.toHaveBeenCalled()

    control(socket, { type: 'output-frame-end' })
    socket.message(new Uint8Array([1]).buffer)
    expect(output).not.toHaveBeenCalled()
    expect(live.terminal.terminalId).toBe('terminal-1')
  })

  it('rejects before ready and reports invalid frames after ready', async () => {
    const callbacks = { output: vi.fn(), exit: vi.fn(), killed: vi.fn(), disconnected: vi.fn() }
    const refused = BrowserTerminalConnection.connect(factory, {
      type: 'attach', sessionId: 'session-1', terminalId: 'missing', cols: 80, rows: 24,
    }, callbacks)
    sockets[0]?.open()
    control(sockets[0]!, { type: 'error', code: 'NO_SESSION', message: 'missing' })
    await expect(refused).rejects.toMatchObject({ code: 'NO_SESSION' })
    sockets[0]?.disconnect()
    sockets[0]?.fail()

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

    const malformed = BrowserTerminalConnection.connect(factory, {
      type: 'attach', sessionId: 'session-1', terminalId: 'terminal-1', cols: 80, rows: 24,
    }, callbacks)
    sockets[3]?.message('not json')
    await expect(malformed).rejects.toMatchObject({ code: 'BAD_RESPONSE' })

    const livePromise = BrowserTerminalConnection.connect(factory, {
      type: 'attach', sessionId: 'session-1', terminalId: 'terminal-1', cols: 80, rows: 24,
    }, callbacks)
    sockets[4]?.open()
    control(sockets[4]!, {
      type: 'ready', terminal: { terminalId: 'terminal-1', label: 'Terminal 1', status: { kind: 'running' } }, replayTruncated: false,
    })
    await livePromise
    control(sockets[4]!, {
      type: 'ready', terminal: { terminalId: 'terminal-1', label: 'Terminal 1', status: { kind: 'running' } }, replayTruncated: false,
    })
    expect(callbacks.disconnected).toHaveBeenCalledWith(expect.objectContaining({ code: 'BAD_RESPONSE' }))
    control(sockets[4]!, { type: 'error', code: 'INTERNAL', message: 'host failed' })
    expect(callbacks.disconnected).toHaveBeenCalledWith(expect.objectContaining({ code: 'INTERNAL' }))
    sockets[4]?.message('not json')
    expect(callbacks.disconnected).toHaveBeenCalledWith(expect.objectContaining({ code: 'BAD_RESPONSE' }))
    sockets[4]?.message(JSON.stringify({ type: 'unknown' }))
    expect(callbacks.disconnected).toHaveBeenCalledWith(expect.objectContaining({ code: 'BAD_RESPONSE' }))
    control(sockets[4]!, { type: 'list', terminals: [] })
    expect(callbacks.disconnected).toHaveBeenCalledWith(expect.objectContaining({ code: 'BAD_RESPONSE' }))

    const throwingCallbacks = {
      ...callbacks,
      exit: () => { throw 'exit failed' },
      disconnected: vi.fn(),
    }
    const throwingExit = BrowserTerminalConnection.connect(factory, {
      type: 'attach', sessionId: 'session-1', terminalId: 'terminal-1', cols: 80, rows: 24,
    }, throwingCallbacks)
    sockets[5]?.open()
    control(sockets[5]!, {
      type: 'ready', terminal: { terminalId: 'terminal-1', label: 'Terminal 1', status: { kind: 'running' } }, replayTruncated: false,
    })
    await throwingExit
    control(sockets[5]!, { type: 'exit', status: { kind: 'running' } })
    expect(throwingCallbacks.disconnected).toHaveBeenCalledWith(expect.objectContaining({ code: 'BAD_RESPONSE' }))
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
