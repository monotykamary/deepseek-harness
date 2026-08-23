// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LIGATURE_SUPPORT_CACHE_MAX_ENTRIES_COUNT, LIGATURE_SUPPORT_PROBE_MAX_CHARACTERS_COUNT } from '../src/client/constants.ts'
import { createLigatureSupportProbe } from '../src/client/ligature-support-probe.ts'

interface Metrics {
  width: number
  actualBoundingBoxLeft: number
  actualBoundingBoxRight: number
  actualBoundingBoxAscent: number
  actualBoundingBoxDescent: number
}

const BASE_METRICS: Metrics = {
  width: 10,
  actualBoundingBoxLeft: 1,
  actualBoundingBoxRight: 9,
  actualBoundingBoxAscent: 8,
  actualBoundingBoxDescent: 2,
}

function context(metrics: () => Metrics, pixels: () => Uint8ClampedArray) {
  return {
    font: '', textBaseline: '', fillStyle: '',
    measureText: vi.fn(metrics),
    fillText: vi.fn(),
    getImageData: vi.fn(() => ({ data: pixels() })),
  } as unknown as CanvasRenderingContext2D
}

function rootWithContexts(
  active: CanvasRenderingContext2D | null,
  inactive: CanvasRenderingContext2D | null,
): HTMLElement {
  const root = document.createElement('div')
  let call = 0
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => {
    call += 1
    return (call === 1 ? active : inactive)
  })
  return root
}

afterEach(() => { vi.restoreAllMocks(); document.body.replaceChildren() })

describe('createLigatureSupportProbe', () => {
  it('uses an always-supported no-resource fallback without an element or either canvas context', () => {
    const absent = createLigatureSupportProbe(undefined, 'mono', 13)
    expect(absent.supports('->')).toBe(true)
    absent.dispose()

    const inactive = context(() => BASE_METRICS, () => new Uint8ClampedArray([1]))
    const firstMissing = createLigatureSupportProbe(rootWithContexts(null, inactive), 'mono', 13)
    expect(firstMissing.supports('->')).toBe(true)
    firstMissing.dispose()
    expect(document.querySelectorAll('canvas')).toHaveLength(0)

    const active = context(() => BASE_METRICS, () => new Uint8ClampedArray([1]))
    const secondMissing = createLigatureSupportProbe(rootWithContexts(active, null), 'mono', 13)
    expect(secondMissing.supports('->')).toBe(true)
    secondMissing.dispose()
  })

  it.each([
    ['width', { width: 11 }],
    ['left', { actualBoundingBoxLeft: 2 }],
    ['right', { actualBoundingBoxRight: 8 }],
    ['ascent', { actualBoundingBoxAscent: 7 }],
    ['descent', { actualBoundingBoxDescent: 3 }],
  ])('accepts a candidate when %s metrics differ', (_name, delta) => {
    const active = context(() => ({ ...BASE_METRICS, ...delta }), () => new Uint8ClampedArray([1]))
    const inactive = context(() => BASE_METRICS, () => new Uint8ClampedArray([1]))
    const root = rootWithContexts(active, inactive)
    const probe = createLigatureSupportProbe(root, 'Test Mono', 14)
    expect(probe.supports('->')).toBe(true)
    expect((active as unknown as { font: string }).font).toContain('14px Test Mono')
    expect(root.querySelectorAll('canvas')).toHaveLength(2)
    probe.dispose()
    expect(root.querySelectorAll('canvas')).toHaveLength(0)
  })

  it('compares equal metrics by pixels, caches results, and handles length and byte differences', () => {
    let activePixels = new Uint8ClampedArray([1, 2])
    let inactivePixels = new Uint8ClampedArray([1, 2])
    const active = context(() => BASE_METRICS, () => activePixels)
    const inactive = context(() => BASE_METRICS, () => inactivePixels)
    const probe = createLigatureSupportProbe(rootWithContexts(active, inactive), 'mono', 13)

    expect(probe.supports('==')).toBe(false)
    expect(probe.supports('==')).toBe(false)
    // Vitest's canvas method replacement is a context-free mock.
    // oxlint-disable-next-line typescript/unbound-method
    expect(active.measureText).toHaveBeenCalledOnce()

    activePixels = new Uint8ClampedArray([1])
    expect(probe.supports('=>')).toBe(true)
    activePixels = new Uint8ClampedArray([1, 3])
    expect(probe.supports('!=' )).toBe(true)
    activePixels = new Uint8ClampedArray([1, 2])
    inactivePixels = new Uint8ClampedArray([1, 3])
    expect(probe.supports('::')).toBe(true)
    probe.dispose()
  })

  it('bypasses huge candidates, recovers canvas failures, and evicts the oldest bounded cache entry', () => {
    let throwMeasure = false
    const active = context(() => {
      if (throwMeasure) throw new Error('canvas failed')
      return { ...BASE_METRICS, width: 11 }
    }, () => new Uint8ClampedArray([1]))
    const inactive = context(() => BASE_METRICS, () => new Uint8ClampedArray([1]))
    const probe = createLigatureSupportProbe(rootWithContexts(active, inactive), 'mono', 13)
    // Vitest's canvas method replacement is a context-free mock.
    // oxlint-disable-next-line typescript/unbound-method
    const measureText = vi.mocked(active.measureText)

    expect(probe.supports('x'.repeat(LIGATURE_SUPPORT_PROBE_MAX_CHARACTERS_COUNT + 1))).toBe(true)
    expect(measureText).not.toHaveBeenCalled()
    throwMeasure = true
    expect(probe.supports('throws')).toBe(true)
    throwMeasure = false

    for (let index = 0; index <= LIGATURE_SUPPORT_CACHE_MAX_ENTRIES_COUNT; index += 1) {
      expect(probe.supports(`candidate-${String(index)}`)).toBe(true)
    }
    const calls = measureText.mock.calls.length
    expect(probe.supports('candidate-0')).toBe(true)
    expect(measureText).toHaveBeenCalledTimes(calls + 1)
    probe.dispose()
  })
})
