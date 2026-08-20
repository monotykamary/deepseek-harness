/**
 * ConnectionController: stream pumping into sinks, the strict readiness
 * handshake (describe + both streams' onOpen, timeout-guarded), generation
 * abort on loss, backoff reconnection, state transitions, and sink-exception
 * isolation. Real (short) timers — the timeout and backoff are configurable,
 * so tests run them at millisecond scale.
 */

import { describe, expect, it, vi } from 'vitest'
import type { SessionId } from '../src/client/api.ts'
import type { ConnectionState } from '../src/client/connection.ts'
import { ConnectionController } from '../src/client/connection.ts'
import { FakeApiClient, deferred, ok } from './fake-api.client.ts'

const SID = 'fk-c1' as SessionId
const FAST = { backoffBaseMs: 10, backoffFactor: 1, backoffMaxMs: 10, streamOpenTimeoutMs: 500 }

function subscribedFrame(lastSeq = 0) {
  return { type: 'session/subscribed', sessionId: SID, lastSeq } as const
}

/** Minimal document stub for the visibility gate (node-env specs have no document). */
function installDocumentVisibility(initial: 'visible' | 'hidden' = 'visible'): { hide(): void; show(): void; restore(): void } {
  const listeners = new Set<() => void>()
  const state = { hidden: initial === 'hidden' }
  const document = {
    get visibilityState() { return state.hidden ? 'hidden' : 'visible' },
    addEventListener(type: string, listener: () => void) {
      if (type === 'visibilitychange') listeners.add(listener)
    },
    removeEventListener(type: string, listener: () => void) {
      if (type === 'visibilitychange') listeners.delete(listener)
    },
  }
  vi.stubGlobal('document', document)
  return {
    hide() { state.hidden = true },
    show() { state.hidden = false; for (const listener of [...listeners]) listener() },
    restore() { vi.unstubAllGlobals() },
  }
}

describe('connection lifecycle', () => {
  it('announces connected after describe + both streams open, then pumps frames to sinks', async () => {
    const api = new FakeApiClient()
    const muxSeen: string[] = []
    const descriptions: boolean[] = []
    let connected = 0
    const controller = new ConnectionController(api, {
      onMuxEnvelope: envelope => muxSeen.push(envelope.payload.type),
      onConnected: (description) => {
        connected++
        descriptions.push(description.canOpenPath)
      },
    }, FAST)
    controller.start()
    try {
      await vi.waitFor(() => { expect(connected).toBe(1) })
      api.pushMux(subscribedFrame())
      await vi.waitFor(() => { expect(muxSeen).toEqual(['session/subscribed']) })
      expect(api.callsOf('host.describe')).toHaveLength(1)
      expect(descriptions).toEqual([true])
    } finally {
      controller.stop()
    }
  })

  it('reconnects with a fresh generation when a stream fails, and stop() ends the loop', async () => {
    const api = new FakeApiClient()
    let connected = 0
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const controller = new ConnectionController(api, { onConnected: () => { connected++ } }, FAST)
    controller.start()
    try {
      await vi.waitFor(() => { expect(connected).toBe(1) })
      api.failStreams(new Error('stream torn'))
      await vi.waitFor(() => { expect(connected).toBe(2) }) // new generation after backoff
      expect(api.openMuxCount).toBe(1) // the dead generation's stream is gone, exactly one live
    } finally {
      controller.stop()
      warnSpy.mockRestore()
    }
    // stop() aborts the live generation (streams tear down) and no reconnect follows.
    await vi.waitFor(() => { expect(api.openMuxCount).toBe(0) })
    await new Promise(resolve => setTimeout(resolve, 40))
    expect(api.openMuxCount).toBe(0)
  })

  it('treats describe failure as generation failure and retries', async () => {
    const api = new FakeApiClient()
    const gate = deferred<Awaited<ReturnType<FakeApiClient['onDescribe']>>>()
    let describeCalls = 0
    api.onDescribe = () => {
      describeCalls++
      return describeCalls === 1 ? Promise.reject(new Error('host down')) : gate.promise
    }
    let connected = 0
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const controller = new ConnectionController(api, { onConnected: () => { connected++ } }, FAST)
    controller.start()
    try {
      await vi.waitFor(() => { expect(describeCalls).toBe(2) }) // retried after backoff
      expect(connected).toBe(0) // never announced during the failed generation
      gate.resolve(ok({ version: '0', cwd: '/f', attachedSessions: 0, home: '/h', canOpenPath: true }))
      await vi.waitFor(() => { expect(connected).toBe(1) })
    } finally {
      controller.stop()
      warnSpy.mockRestore()
    }
  })

  it('treats a host.describe business error as generation failure', async () => {
    const api = new FakeApiClient()
    let describeCalls = 0
    api.onDescribe = () => {
      describeCalls += 1
      if (describeCalls === 1) {
        return Promise.resolve({
          rpcId: 'bad-describe' as never,
          result: {
            ok: false as const,
            error: { code: 'internal' as const, message: 'not ready', details: {} },
          },
        })
      }
      return Promise.resolve(ok({ version: '0', cwd: '/f', attachedSessions: 0, home: '/h', canOpenPath: true }))
    }
    let connected = 0
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const controller = new ConnectionController(api, { onConnected: () => { connected++ } }, FAST)
    controller.start()
    try {
      await vi.waitFor(() => { expect(describeCalls).toBe(2) })
      await vi.waitFor(() => { expect(connected).toBe(1) })
    } finally {
      controller.stop()
      warnSpy.mockRestore()
    }
  })

  it('converges stream/error frames into reconnect instead of dispatching them', async () => {
    const api = new FakeApiClient()
    const muxSeen: string[] = []
    let connected = 0
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const controller = new ConnectionController(api, {
      onMuxEnvelope: envelope => muxSeen.push(envelope.payload.type),
      onConnected: () => { connected++ },
    }, FAST)
    controller.start()
    try {
      await vi.waitFor(() => { expect(connected).toBe(1) })
      api.pushMux({ type: 'stream/error', error: { code: 'internal', message: 'impl broke', details: {} } })
      await vi.waitFor(() => { expect(connected).toBe(2) }) // treated as loss → reconnect
      expect(muxSeen).toEqual([]) // never forwarded to the business sink
    } finally {
      controller.stop()
      warnSpy.mockRestore()
    }
  })

  it('isolates sink exceptions from the pump', async () => {
    const api = new FakeApiClient()
    const seen: string[] = []
    let connected = 0
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const controller = new ConnectionController(api, {
      onMuxEnvelope: (envelope) => {
        seen.push(envelope.payload.type)
        throw new Error('business layer bug')
      },
      onConnected: () => { connected++ },
    }, FAST)
    controller.start()
    try {
      await vi.waitFor(() => { expect(connected).toBe(1) })
      api.pushMux(subscribedFrame(1))
      api.pushMux(subscribedFrame(2))
      await vi.waitFor(() => { expect(seen).toHaveLength(2) }) // second frame still pumped
      expect(connected).toBe(1) // no reconnect triggered by the sink throw
    } finally {
      controller.stop()
      errorSpy.mockRestore()
    }
  })

  it('holds onConnected until both streams establish even after describe succeeds', async () => {
    const api = new FakeApiClient()
    api.holdStreamOpen = true // describe resolves immediately; stream establishment is in the case's hand
    let connected = 0
    const controller = new ConnectionController(api, { onConnected: () => { connected++ } }, FAST)
    controller.start()
    try {
      await vi.waitFor(() => { expect(api.callsOf('host.describe')).toHaveLength(1) })
      await new Promise(resolve => setTimeout(resolve, 30))
      expect(connected).toBe(0) // describe alone must not announce
      api.releaseStreamOpens()
      await vi.waitFor(() => { expect(connected).toBe(1) })
    } finally {
      controller.stop()
    }
  })

  it('rejects a generation whose streams end during readiness and retries', async () => {
    const api = new FakeApiClient()
    const firstDescribe = deferred<Awaited<ReturnType<FakeApiClient['onDescribe']>>>()
    let describeCalls = 0
    api.onDescribe = () => {
      describeCalls++
      return describeCalls === 1
        ? firstDescribe.promise
        : Promise.resolve(ok({ version: '0', cwd: '/f', attachedSessions: 0, home: '/h', canOpenPath: true }))
    }
    const states: ConnectionState[] = []
    let connected = 0
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const controller = new ConnectionController(api, {
      onConnected: () => { connected++ },
      onStateChange: state => states.push(state),
    }, FAST)
    controller.start()
    try {
      await vi.waitFor(() => { expect(api.openMuxCount).toBe(1) })
      api.endStreams()
      firstDescribe.resolve(ok({ version: '0', cwd: '/f', attachedSessions: 0, home: '/h', canOpenPath: true }))

      await vi.waitFor(() => { expect(describeCalls).toBe(2) })
      await vi.waitFor(() => { expect(connected).toBe(1) })
      expect(states).toEqual(['reconnecting', 'connected'])
    } finally {
      controller.stop()
      warnSpy.mockRestore()
    }
  })

  it('proceeds as connected via the timeout guard when a carrier never fires onOpen', async () => {
    const api = new FakeApiClient()
    api.suppressStreamOpen = true // misbehaving carrier: streams open but onOpen never fires
    let connected = 0
    const controller = new ConnectionController(api, { onConnected: () => { connected++ } }, { ...FAST, streamOpenTimeoutMs: 20 })
    controller.start()
    try {
      await vi.waitFor(() => { expect(connected).toBe(1) }) // handshake resolved by the guard, not wedged
    } finally {
      controller.stop()
    }
  })

  it('emits deduplicated connected/reconnecting state transitions', async () => {
    const api = new FakeApiClient()
    const states: ConnectionState[] = []
    let connected = 0
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const controller = new ConnectionController(api, {
      onConnected: () => { connected++ },
      onStateChange: state => states.push(state),
    }, FAST)
    controller.start()
    try {
      await vi.waitFor(() => { expect(connected).toBe(1) })
      expect(states).toEqual(['connected'])
      api.failStreams(new Error('torn'))
      await vi.waitFor(() => { expect(connected).toBe(2) })
      expect(states).toEqual(['connected', 'reconnecting', 'connected'])
    } finally {
      controller.stop()
      warnSpy.mockRestore()
    }
  })

  it('does not announce a generation stopped synchronously by its connected state sink', async () => {
    const api = new FakeApiClient()
    const states: ConnectionState[] = []
    let connected = 0
    const controller = new ConnectionController(api, {
      onConnected: () => { connected++ },
      onStateChange: (state) => {
        states.push(state)
        if (state === 'connected') controller.stop()
      },
    }, FAST)

    controller.start()
    await vi.waitFor(() => { expect(states).toEqual(['connected']) })
    await vi.waitFor(() => { expect(api.openMuxCount).toBe(0) })
    expect(connected).toBe(0)
  })

  it('deduplicates consecutive reconnecting emissions across two straight failures', async () => {
    const api = new FakeApiClient()
    const gate = deferred<Awaited<ReturnType<FakeApiClient['onDescribe']>>>()
    let describeCalls = 0
    api.onDescribe = () => {
      describeCalls++
      return describeCalls <= 2 ? Promise.reject(new Error('down')) : gate.promise
    }
    const states: ConnectionState[] = []
    let connected = 0
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const controller = new ConnectionController(api, {
      onConnected: () => { connected++ },
      onStateChange: state => states.push(state),
    }, FAST)
    controller.start()
    try {
      await vi.waitFor(() => { expect(describeCalls).toBe(3) })
      gate.resolve(ok({ version: '0', cwd: '/f', attachedSessions: 0, home: '/h', canOpenPath: true }))
      await vi.waitFor(() => { expect(connected).toBe(1) })
      expect(states).toEqual(['reconnecting', 'connected']) // two failures, one reconnecting emission
    } finally {
      controller.stop()
      warnSpy.mockRestore()
    }
  })

  it('runs with no sinks at all (every callback slot optional)', async () => {
    const api = new FakeApiClient()
    const controller = new ConnectionController(api, {}, FAST)
    controller.start()
    try {
      await vi.waitFor(() => { expect(api.callsOf('host.describe')).toHaveLength(1) })
      api.pushMux(subscribedFrame()) // pumped with sink undefined: dropped silently
      await new Promise(resolve => setTimeout(resolve, 20))
    } finally {
      controller.stop()
    }
  })

  it('start() is idempotent (one loop, one stream set)', async () => {
    const api = new FakeApiClient()
    let connected = 0
    const controller = new ConnectionController(api, { onConnected: () => { connected++ } }, FAST)
    controller.start()
    controller.start()
    try {
      await vi.waitFor(() => { expect(connected).toBe(1) })
      expect(api.openMuxCount).toBe(1)
      expect(api.callsOf('host.describe')).toHaveLength(1)
    } finally {
      controller.stop()
    }
  })

  it('pauses retries while the document is hidden and resumes immediately on visibility', async () => {
    const visibility = installDocumentVisibility('visible')
    const api = new FakeApiClient()
    const failure = deferred<Awaited<ReturnType<FakeApiClient['onDescribe']>>>()
    let describeCalls = 0
    api.onDescribe = () => {
      describeCalls++
      return describeCalls === 1
        ? failure.promise
        : Promise.resolve(ok({ version: '0', cwd: '/f', attachedSessions: 0, home: '/f', canOpenPath: true }))
    }
    let connected = 0
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const controller = new ConnectionController(api, { onConnected: () => { connected++ } }, FAST)
    controller.start()
    try {
      await vi.waitFor(() => { expect(describeCalls).toBe(1) })
      visibility.hide()
      failure.reject(new Error('host down'))
      // Several backoff windows pass while hidden: the loop must not retry.
      await new Promise(resolve => setTimeout(resolve, 60))
      expect(describeCalls).toBe(1)
      visibility.show()
      await vi.waitFor(() => { expect(describeCalls).toBe(2) }) // immediate retry on visibility
      await vi.waitFor(() => { expect(connected).toBe(1) })
    } finally {
      controller.stop()
      visibility.restore()
      warnSpy.mockRestore()
    }
  })

  it('stop() ends a hidden-tab visibility wait without further retries', async () => {
    const visibility = installDocumentVisibility('visible')
    const api = new FakeApiClient()
    const failure = deferred<Awaited<ReturnType<FakeApiClient['onDescribe']>>>()
    let describeCalls = 0
    api.onDescribe = () => {
      describeCalls++
      return failure.promise
    }
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const controller = new ConnectionController(api, {}, FAST)
    controller.start()
    try {
      await vi.waitFor(() => { expect(describeCalls).toBe(1) })
      visibility.hide()
      failure.reject(new Error('host down'))
      await new Promise(resolve => setTimeout(resolve, 30)) // settled into the paused wait
      controller.stop()
      visibility.show()
      await new Promise(resolve => setTimeout(resolve, 40))
      expect(describeCalls).toBe(1) // no retry after stop + visibility
      expect(api.openMuxCount).toBe(0)
    } finally {
      controller.stop()
      visibility.restore()
      warnSpy.mockRestore()
    }
  })

  it('stop() aborts an in-flight backoff sleep so a restart never races a stale loop', async () => {
    const api = new FakeApiClient()
    const SLOW = { backoffBaseMs: 300, backoffFactor: 1, backoffMaxMs: 300, streamOpenTimeoutMs: 500 }
    let connected = 0
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const controller = new ConnectionController(api, { onConnected: () => { connected++ } }, SLOW)
    controller.start()
    try {
      await vi.waitFor(() => { expect(connected).toBe(1) })
      api.failStreams(new Error('torn'))
      await vi.waitFor(() => { expect(api.openMuxCount).toBe(0) })
      controller.stop() // the loop now sleeps 150-300ms; stop() must abort it
      controller.start() // a fresh loop reconnects immediately (first attempt always runs)
      await vi.waitFor(() => { expect(connected).toBe(2) })
      await new Promise(resolve => setTimeout(resolve, 400)) // past the abandoned backoff window
      expect(api.openMuxCount).toBe(1) // the stale loop never woke to open a second generation
      expect(api.callsOf('host.describe')).toHaveLength(2)
    } finally {
      controller.stop()
      warnSpy.mockRestore()
    }
  })
})
