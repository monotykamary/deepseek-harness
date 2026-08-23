/** Adapted from localterm revision 8de7394; MIT license in THIRD_PARTY_NOTICES.md. */

import {
  LIGATURE_SUPPORT_CACHE_MAX_ENTRIES_COUNT,
  LIGATURE_SUPPORT_PROBE_MAX_CHARACTERS_COUNT,
} from './constants.ts'

/** Active-font raster comparison used to reject unsupported ligature candidates. */
export interface LigatureSupportProbe {
  /** Test whether active OpenType features alter one candidate. */
  supports: (text: string) => boolean
  /** Remove hidden canvases and cached support results. */
  dispose: () => void
}

const ACTIVE_LIGATURE_FEATURES = '"calt" on, "liga" on'
const INACTIVE_LIGATURE_FEATURES = '"calt" off, "liga" off'

const alwaysSupportedProbe = (): LigatureSupportProbe => ({
  supports: () => true,
  dispose: () => {},
})

const areTextMetricsEqual = (left: TextMetrics, right: TextMetrics): boolean =>
  left.width === right.width &&
  left.actualBoundingBoxLeft === right.actualBoundingBoxLeft &&
  left.actualBoundingBoxRight === right.actualBoundingBoxRight &&
  left.actualBoundingBoxAscent === right.actualBoundingBoxAscent &&
  left.actualBoundingBoxDescent === right.actualBoundingBoxDescent

const arePixelBuffersEqual = (left: Uint8ClampedArray, right: Uint8ClampedArray): boolean => {
  if (left.length !== right.length) return false
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false
  }
  return true
}

/**
 * Create a bounded active/inactive OpenType raster comparison beside xterm.
 * @param terminalElement - xterm root that supplies document and inherited font behavior.
 * @param fontFamily - resolved CSS font-family chain.
 * @param fontSizePx - active xterm font size in pixels.
 * @returns support probe whose hidden canvases require explicit disposal.
 */
export const createLigatureSupportProbe = (
  terminalElement: HTMLElement | undefined,
  fontFamily: string,
  fontSizePx: number,
): LigatureSupportProbe => {
  if (!terminalElement) return alwaysSupportedProbe()

  const activeCanvas = terminalElement.ownerDocument.createElement('canvas')
  const inactiveCanvas = terminalElement.ownerDocument.createElement('canvas')
  activeCanvas.style.display = 'none'
  inactiveCanvas.style.display = 'none'
  activeCanvas.style.fontFeatureSettings = ACTIVE_LIGATURE_FEATURES
  inactiveCanvas.style.fontFeatureSettings = INACTIVE_LIGATURE_FEATURES

  // Chromium applies inherited OpenType feature settings to canvas text only
  // while the canvas belongs to the document, matching xterm's atlas canvas.
  terminalElement.append(activeCanvas, inactiveCanvas)

  const activeContext = activeCanvas.getContext('2d', { willReadFrequently: true })
  const inactiveContext = inactiveCanvas.getContext('2d', { willReadFrequently: true })
  if (!activeContext || !inactiveContext) {
    activeCanvas.remove()
    inactiveCanvas.remove()
    return alwaysSupportedProbe()
  }

  const font = `normal 400 ${fontSizePx}px ${fontFamily}`
  const supportCache = new Map<string, boolean>()

  const rememberSupport = (text: string, isSupported: boolean): boolean => {
    if (supportCache.size >= LIGATURE_SUPPORT_CACHE_MAX_ENTRIES_COUNT) {
      const oldestText = supportCache.keys().next().value
      if (oldestText !== undefined) supportCache.delete(oldestText)
    }
    supportCache.set(text, isSupported)
    return isSupported
  }

  const configureContext = (context: CanvasRenderingContext2D): void => {
    context.font = font
    context.textBaseline = 'alphabetic'
    context.fillStyle = '#ffffff'
  }

  const supports = (text: string): boolean => {
    const cachedSupport = supportCache.get(text)
    if (cachedSupport !== undefined) return cachedSupport
    if (text.length > LIGATURE_SUPPORT_PROBE_MAX_CHARACTERS_COUNT) return true

    try {
      configureContext(activeContext)
      configureContext(inactiveContext)
      const activeMetrics = activeContext.measureText(text)
      const inactiveMetrics = inactiveContext.measureText(text)
      if (!areTextMetricsEqual(activeMetrics, inactiveMetrics)) {
        return rememberSupport(text, true)
      }

      const contentWidthPx = Math.max(
        activeMetrics.width,
        inactiveMetrics.width,
        Math.abs(activeMetrics.actualBoundingBoxLeft) +
          Math.abs(activeMetrics.actualBoundingBoxRight),
        Math.abs(inactiveMetrics.actualBoundingBoxLeft) +
          Math.abs(inactiveMetrics.actualBoundingBoxRight),
      )
      const canvasWidthPx = Math.ceil(fontSizePx + contentWidthPx + fontSizePx)
      const canvasHeightPx = Math.ceil(fontSizePx + fontSizePx + fontSizePx)
      const baselinePx = fontSizePx + fontSizePx

      activeCanvas.width = canvasWidthPx
      activeCanvas.height = canvasHeightPx
      inactiveCanvas.width = canvasWidthPx
      inactiveCanvas.height = canvasHeightPx
      configureContext(activeContext)
      configureContext(inactiveContext)
      activeContext.fillText(text, fontSizePx, baselinePx)
      inactiveContext.fillText(text, fontSizePx, baselinePx)
      const activePixels = activeContext.getImageData(0, 0, canvasWidthPx, canvasHeightPx).data
      const inactivePixels = inactiveContext.getImageData(0, 0, canvasWidthPx, canvasHeightPx).data
      return rememberSupport(text, !arePixelBuffersEqual(activePixels, inactivePixels))
    } catch {
      return true
    }
  }

  return {
    supports,
    dispose: () => {
      supportCache.clear()
      activeCanvas.remove()
      inactiveCanvas.remove()
    },
  }
}
