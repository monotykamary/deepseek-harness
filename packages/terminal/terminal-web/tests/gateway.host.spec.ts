import { once } from 'node:events'
import { PassThrough } from 'node:stream'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Context } from '@monotykamary/cordis'
import type { Agent } from '@monotykamary/dsh-agent'
import type { ConnectionUpgradeAdmission } from '@monotykamary/dsh-client-connection'
import type {
  TerminalInteractiveAttachment, TerminalSessionSnapshot, TerminalSessionStatus,
} from '@monotykamary/dsh-terminal'
import WebSocket from 'ws'
import {
  BrowserTerminalGateway, TERMINAL_WEBSOCKET_PATH,
} from '../src/index.ts'
import type { BrowserTerminalServerControl } from '../src/protocol.ts'

interface Frame {
  readonly binary: boolean
  readonly data: Buffer
}

class FrameCollector {
  private readonly buffered: Frame[] = []
  private readonly waiting: ((frame: Frame) => void)[] = []

  constructor(socket: WebSocket) {
    socket.on('message', (data, binary) => {
      const frame = { binary, data: Buffer.from(data as ArrayBuffer) }
      const waiter = this.waiting.shift()
      if (waiter === undefined) this.buffered.push(frame)
      else waiter(frame)
    })
  }

  next(): Promise<Frame> {
    const frame = this.buffered.shift()
    return frame === undefined ? new Promise((resolve) => { this.waiting.push(resolve) }) : Promise.resolve(frame)
  }

  async control(): Promise<BrowserTerminalServerControl> {
    const frame = await this.next()
    expect(frame.binary).toBe(false)
    return JSON.parse(frame.data.toString('utf8')) as BrowserTerminalServerControl
  }
}

class FakeAttachment implements TerminalInteractiveAttachment {
  readonly output = new PassThrough()
  readonly replayTruncated = true
  readonly write = vi.fn<(input: string) => Promise<void>>(async () => {})
  readonly resize = vi.fn<(cols: number, rows: number) => Promise<void>>(async () => {})
  readonly close = vi.fn(() => { this.output.destroy() })
  statusValue: TerminalSessionStatus = { kind: 'running' }

  status(): TerminalSessionStatus {
    return this.statusValue
  }
}

class FakeTerminals {
  readonly attachment = new FakeAttachment()
  readonly spawn = vi.fn(async (_agent: Agent, request: { type: string; name?: string }) => {
    const snapshot: TerminalSessionSnapshot = {
      sessionId: `terminal-${String(this.snapshots.length + 1)}` as never,
      type: request.type,
      ...request.name === undefined ? {} : { name: request.name },
      pid: 41,
      status: { kind: 'running' },
    }
    this.snapshots.push(snapshot)
    return snapshot
  })
  readonly attach = vi.fn(() => this.attachment)
  readonly kill = vi.fn(async () => {})

  constructor(readonly snapshots: TerminalSessionSnapshot[] = []) {}

  list(): readonly TerminalSessionSnapshot[] {
    return [...this.snapshots]
  }
}

const cleanups: (() => Promise<void>)[] = []

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map(cleanup => cleanup()))
})

function snapshot(id: string, name: string | undefined, status: TerminalSessionStatus = { kind: 'running' }): TerminalSessionSnapshot {
  return {
    sessionId: id as never,
    type: 'shell',
    ...name === undefined ? {} : { name },
    pid: 12,
    status,
  }
}

function harness(terminals = new FakeTerminals(), owner = 'owner-1', config: ConstructorParameters<typeof BrowserTerminalGateway>[1] = {}): {
  readonly gateway: BrowserTerminalGateway
  readonly terminals: FakeTerminals
} {
  const agent = {
    session: { header: { owner, cwd: '/workspace' } },
    ctx: { get: (key: string) => key === 'terminals' ? terminals : undefined },
  } as unknown as Agent
  const ctx = {
    agents: { get: (id: string) => id === 'session-1' ? agent : undefined },
    terminals,
  } as unknown as Context
  return { gateway: new BrowserTerminalGateway(ctx, config), terminals }
}

async function serve(gateway: BrowserTerminalGateway, admission: ConnectionUpgradeAdmission = {
  owner: 'owner-1', operator: false,
}): Promise<string> {
  const server = createServer()
  server.on('upgrade', (request, socket, head) => {
    if (new URL(request.url ?? '/', 'http://dsh.internal').pathname === TERMINAL_WEBSOCKET_PATH) {
      gateway.handleUpgrade(request, socket, head, admission)
    } else socket.destroy()
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  cleanups.push(async () => {
    await gateway.close()
    await new Promise<void>(resolve => server.close(() => { resolve() }))
  })
  return `ws://127.0.0.1:${String((server.address() as AddressInfo).port)}${TERMINAL_WEBSOCKET_PATH}`
}

async function connect(url: string): Promise<{ socket: WebSocket; frames: FrameCollector }> {
  const socket = new WebSocket(url)
  const frames = new FrameCollector(socket)
  await once(socket, 'open')
  return { socket, frames }
}

async function closeSocket(socket: WebSocket): Promise<void> {
  if (socket.readyState === WebSocket.CLOSED) return
  const closed = once(socket, 'close')
  socket.close()
  await closed
}

describe('BrowserTerminalGateway', () => {
  it('lists only the requested browser placement and projects exited status', async () => {
    const terminals = new FakeTerminals([
      snapshot('bottom-1', 'web-bottom-1'),
      snapshot('bottom-2', 'web-bottom-2', { kind: 'exited', exitCode: 7, signal: null }),
      snapshot('right-1', 'web-right-1'),
      snapshot('model-1', undefined),
    ])
    const { gateway } = harness(terminals)
    const { socket, frames } = await connect(await serve(gateway))
    socket.send(JSON.stringify({ type: 'list', sessionId: 'session-1', placement: 'bottom' }))

    expect(await frames.control()).toEqual({
      type: 'list',
      terminals: [
        { terminalId: 'bottom-1', label: 'Terminal 1', status: { kind: 'running' } },
        { terminalId: 'bottom-2', label: 'Terminal 2', status: { kind: 'exited', exitCode: 7, signal: null } },
      ],
    })
    await once(socket, 'close')
  })

  it('opens a numbered terminal and carries output, input, resize, ping, and kill frames', async () => {
    const terminals = new FakeTerminals([
      snapshot('old-1', 'web-bottom-1'),
      snapshot('old-3', 'web-bottom-3'),
    ])
    const { gateway } = harness(terminals, 'owner-1', { outputBatchWindowMs: 1 })
    const { socket, frames } = await connect(await serve(gateway))
    socket.send(JSON.stringify({
      type: 'open', sessionId: 'session-1', placement: 'bottom', cols: 90, rows: 32,
    }))

    expect(await frames.control()).toEqual({
      type: 'ready',
      terminal: { terminalId: 'terminal-3', label: 'Terminal 2', status: { kind: 'running' } },
      replayTruncated: true,
    })
    expect(terminals.spawn).toHaveBeenCalledWith(expect.anything(), {
      type: 'shell', name: 'web-bottom-2', cwd: '/workspace', interactive: true,
      rows: 32, cols: 90,
    })
    expect(terminals.attachment.resize).toHaveBeenCalledWith(90, 32)

    terminals.attachment.output.write('hello')
    const output = await frames.next()
    expect(output).toEqual({ binary: true, data: Buffer.from('hello') })

    socket.send(Buffer.from('echo hi\n'))
    socket.send(JSON.stringify({ type: 'resize', cols: 120, rows: 45 }))
    socket.send(JSON.stringify({ type: 'ping', sentAt: 123 }))
    expect(await frames.control()).toEqual({ type: 'pong', sentAt: 123 })
    await vi.waitFor(() => {
      expect(terminals.attachment.write).toHaveBeenCalledWith('echo hi\n')
      expect(terminals.attachment.resize).toHaveBeenLastCalledWith(120, 45)
    })

    socket.send(JSON.stringify({ type: 'kill' }))
    expect(await frames.control()).toEqual({ type: 'killed', terminalId: 'terminal-3' })
    await once(socket, 'close')
    expect(terminals.kill).toHaveBeenCalledWith(expect.anything(), 'terminal-3', 'browser request')
    expect(terminals.attachment.close).toHaveBeenCalledOnce()
  })

  it('attaches an existing right terminal, flushes final output, and reports process exit', async () => {
    const terminals = new FakeTerminals([
      snapshot('right-2', 'web-right-2'),
    ])
    terminals.attachment.output.write('replay')
    const { gateway } = harness(terminals, 'owner-1', { outputBatchWindowMs: 60_000 })
    const { socket, frames } = await connect(await serve(gateway))
    socket.send(JSON.stringify({
      type: 'attach', sessionId: 'session-1', terminalId: 'right-2', cols: 80, rows: 24,
    }))
    expect(await frames.control()).toEqual({
      type: 'ready',
      terminal: { terminalId: 'right-2', label: 'Terminal 2', status: { kind: 'running' } },
      replayTruncated: true,
    })
    terminals.attachment.statusValue = { kind: 'exited', exitCode: null, signal: 'SIGTERM' }
    terminals.attachment.output.end('tail')
    expect((await frames.next()).data.toString()).toBe('replaytail')
    expect(await frames.control()).toEqual({
      type: 'exit', status: { kind: 'exited', exitCode: null, signal: 'SIGTERM' },
    })
    await once(socket, 'close')
    expect(terminals.attachment.close).toHaveBeenCalledOnce()
  })

  it('kills a terminal without creating an attachment', async () => {
    const { gateway, terminals } = harness()
    const { socket, frames } = await connect(await serve(gateway, { owner: null, operator: true }))
    socket.send(JSON.stringify({ type: 'kill', sessionId: 'session-1', terminalId: 'terminal-9' }))
    expect(await frames.control()).toEqual({ type: 'killed', terminalId: 'terminal-9' })
    await once(socket, 'close')
    expect(terminals.kill).toHaveBeenCalledWith(expect.anything(), 'terminal-9', 'browser request')
    expect(terminals.attach).not.toHaveBeenCalled()
  })

  it.each([
    [{ type: 'list', sessionId: 'session-1', placement: 'left' }, 'BAD_REQUEST'],
    [{ type: 'attach', sessionId: 'session-1', terminalId: 'missing', cols: 80, rows: 24 }, 'NO_SESSION'],
    [{ type: 'unknown', sessionId: 'session-1' }, 'BAD_REQUEST'],
    [{ type: 'list', sessionId: 'missing', placement: 'right' }, 'NO_SESSION'],
  ])('reports rejected handshake %# without leaking an attachment', async (handshake, code) => {
    const { gateway, terminals } = harness()
    const { socket, frames } = await connect(await serve(gateway))
    socket.send(JSON.stringify(handshake))
    expect(await frames.control()).toMatchObject({ type: 'error', code })
    await once(socket, 'close')
    expect(terminals.attach).not.toHaveBeenCalled()
  })

  it('refuses attachment to a model-owned terminal session', async () => {
    const terminals = new FakeTerminals([snapshot('model-1', undefined)])
    const { gateway } = harness(terminals)
    const { socket, frames } = await connect(await serve(gateway))
    socket.send(JSON.stringify({
      type: 'attach', sessionId: 'session-1', terminalId: 'model-1', cols: 80, rows: 24,
    }))
    expect(await frames.control()).toMatchObject({ type: 'error', code: 'NO_SESSION' })
    await once(socket, 'close')
    expect(terminals.attach).not.toHaveBeenCalled()
  })

  it('hides an Agent from a mismatched admitted owner', async () => {
    const { gateway } = harness()
    const { socket, frames } = await connect(await serve(gateway, { owner: 'owner-2', operator: false }))
    socket.send(JSON.stringify({ type: 'list', sessionId: 'session-1', placement: 'right' }))
    expect(await frames.control()).toMatchObject({ type: 'error', code: 'NO_SESSION' })
    await once(socket, 'close')
  })

  it('rejects binary, malformed, and timed-out handshakes', async () => {
    const { gateway } = harness(new FakeTerminals(), 'owner-1', { handshakeTimeoutMs: 20 })
    const url = await serve(gateway)

    const binary = await connect(url)
    binary.socket.send(Buffer.from('binary'))
    expect(await binary.frames.control()).toMatchObject({ type: 'error', code: 'BAD_REQUEST' })
    await once(binary.socket, 'close')

    const malformed = await connect(url)
    malformed.socket.send('{')
    expect(await malformed.frames.control()).toMatchObject({ type: 'error', code: 'BAD_REQUEST' })
    await once(malformed.socket, 'close')

    const timedOut = await connect(url)
    expect(await timedOut.frames.control()).toMatchObject({ type: 'error', code: 'HANDSHAKE_TIMEOUT' })
    await once(timedOut.socket, 'close')
  })

  it('reports invalid live controls and invalid UTF-8 input', async () => {
    const terminals = new FakeTerminals([snapshot('right-1', 'web-right-1')])
    const { gateway } = harness(terminals)
    const url = await serve(gateway)

    const invalidControl = await connect(url)
    invalidControl.socket.send(JSON.stringify({
      type: 'attach', sessionId: 'session-1', terminalId: 'right-1', cols: 80, rows: 24,
    }))
    await invalidControl.frames.control()
    invalidControl.socket.send(JSON.stringify({ type: 'resize', cols: 0, rows: 24 }))
    expect(await invalidControl.frames.control()).toMatchObject({ type: 'error', code: 'BAD_REQUEST' })
    await once(invalidControl.socket, 'close')

    const invalidInput = await connect(url)
    invalidInput.socket.send(JSON.stringify({
      type: 'attach', sessionId: 'session-1', terminalId: 'right-1', cols: 80, rows: 24,
    }))
    await invalidInput.frames.control()
    const closed = once(invalidInput.socket, 'close')
    invalidInput.socket.send(Buffer.from([0xff]))
    const [code] = await closed as [number]
    expect(code).toBe(1003)
  })

  it('disconnects an attachment whose output exceeds its configured backpressure bound', async () => {
    const terminals = new FakeTerminals([snapshot('right-1', 'web-right-1')])
    const { gateway } = harness(terminals, 'owner-1', {
      outputBatchBytes: 4, maxBufferedBytes: 4, outputBatchWindowMs: 1,
    })
    const { socket, frames } = await connect(await serve(gateway))
    socket.send(JSON.stringify({
      type: 'attach', sessionId: 'session-1', terminalId: 'right-1', cols: 80, rows: 24,
    }))
    await frames.control()
    const closed = once(socket, 'close')
    terminals.attachment.output.write('12345')
    const [code] = await closed as [number]
    expect(code).toBe(1013)
    await vi.waitFor(() => { expect(terminals.attachment.close).toHaveBeenCalledOnce() })
  })

  it('validates deployment limits and destroys upgrades after disposal starts', async () => {
    expect(() => harness(new FakeTerminals(), 'owner', { backendType: '' })).toThrow('backendType')
    expect(() => harness(new FakeTerminals(), 'owner', { maxRows: 0 })).toThrow('maxRows')
    expect(() => harness(new FakeTerminals(), 'owner', {
      outputBatchBytes: 5, maxBufferedBytes: 4,
    })).toThrow('outputBatchBytes')

    const { gateway } = harness()
    await gateway.close()
    const socket = { destroy: vi.fn() }
    gateway.handleUpgrade({} as never, socket as never, Buffer.alloc(0), { owner: null, operator: true })
    expect(socket.destroy).toHaveBeenCalledOnce()
  })

  it('closes a live attachment when the browser disconnects', async () => {
    const terminals = new FakeTerminals([snapshot('right-1', 'web-right-1')])
    const { gateway } = harness(terminals)
    const { socket, frames } = await connect(await serve(gateway))
    socket.send(JSON.stringify({
      type: 'attach', sessionId: 'session-1', terminalId: 'right-1', cols: 80, rows: 24,
    }))
    await frames.control()
    await closeSocket(socket)
    await vi.waitFor(() => { expect(terminals.attachment.close).toHaveBeenCalledOnce() })
    expect(terminals.kill).not.toHaveBeenCalled()
  })
})
