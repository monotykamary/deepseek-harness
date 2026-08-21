import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { detectImage, fitImageToLimits, probeImage } from '../src/image.ts'

async function raster(format: 'png' | 'jpeg' | 'webp' | 'gif'): Promise<Uint8Array> {
  const image = sharp({
    create: { width: 3, height: 2, channels: 4, background: { r: 1, g: 2, b: 3, alpha: 1 } },
  })
  return new Uint8Array(await image.toFormat(format).toBuffer())
}

/** 2-frame animated GIF (3x2 logical screen, two solid frames). */
const ANIMATED_GIF = Uint8Array.from(Buffer.from(
  'R0lGODlhAwACAIEAAP8AAAAAAAAAAAAAACH/C05FVFNDQVBFMi4wAwEAAAAh+QQACgAAACwAAAAAAwACAAAIBgABCBwYEAAh+QQBCgABACwAAAAAAwACAIEAAP8AAAAAAAAAAAAIBgABCBwYEAA7',
  'base64',
))

describe('raster decoding', () => {
  it('decodes every supported format and its intrinsic dimensions', async () => {
    for (const [format, mediaType] of [
      ['png', 'image/png'],
      ['jpeg', 'image/jpeg'],
      ['webp', 'image/webp'],
      ['gif', 'image/gif'],
    ] as const) {
      await expect(detectImage(await raster(format)))
        .resolves.toEqual({ mediaType, width: 3, height: 2 })
    }
  })

  it('rejects malformed bytes and truncated payloads with readable headers', async () => {
    await expect(detectImage(Uint8Array.of(1, 2, 3)))
      .rejects.toMatchObject({ code: 'INVALID_IMAGE' })
    const unsupported = await sharp({
      create: { width: 1, height: 1, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } },
    }).tiff().toBuffer()
    await expect(detectImage(unsupported)).rejects.toMatchObject({ code: 'INVALID_IMAGE' })
    const complete = await raster('png')
    const truncated = complete.subarray(0, 62)
    await expect(sharp(truncated).metadata()).resolves.toMatchObject({ width: 3, height: 2 })
    await expect(detectImage(truncated)).rejects.toMatchObject({ code: 'INVALID_IMAGE' })
  })

  it('probes malformed bytes and unsupported formats into the same stable error', async () => {
    await expect(probeImage(Uint8Array.of(1, 2, 3)))
      .rejects.toMatchObject({ code: 'INVALID_IMAGE' })
    const unsupported = await sharp({
      create: { width: 1, height: 1, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } },
    }).tiff().toBuffer()
    await expect(probeImage(unsupported)).rejects.toMatchObject({ code: 'INVALID_IMAGE' })
  })
})

describe('admission resampling', () => {
  it('returns bytes unchanged while the image fits the configured bounds', async () => {
    const png = await raster('png')
    const fitted = await fitImageToLimits(png, { maxDimension: 3, maxPixels: 6 })
    expect(fitted).toEqual({ data: png, detected: { mediaType: 'image/png', width: 3, height: 2 } })
  })

  it('downscales the longer side to the per-side bound', async () => {
    const fitted = await fitImageToLimits(await raster('png'), { maxDimension: 2 })
    expect(fitted.detected).toEqual({ mediaType: 'image/png', width: 2, height: 1 })
    await expect(detectImage(fitted.data)).resolves.toEqual({ mediaType: 'image/png', width: 2, height: 1 })
  })

  it('downscales to the decoded-pixel bound when it binds tighter', async () => {
    const fitted = await fitImageToLimits(await raster('png'), { maxPixels: 4 })
    expect(fitted.detected).toEqual({ mediaType: 'image/png', width: 2, height: 2 })
  })

  it('keeps a side at its minimum while the pixel bound shrinks the other', async () => {
    const wide = new Uint8Array(await sharp({
      create: { width: 2001, height: 1, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } },
    }).png().toBuffer())
    const fitted = await fitImageToLimits(wide, { maxPixels: 100 })
    expect(fitted.detected).toEqual({ mediaType: 'image/png', width: 100, height: 1 })
  })

  it('shrinks the taller side when the pixel bound leaves the short side at its minimum', async () => {
    const tall = new Uint8Array(await sharp({
      create: { width: 3, height: 5, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } },
    }).png().toBuffer())
    const fitted = await fitImageToLimits(tall, { maxPixels: 4 })
    expect(fitted.detected).toEqual({ mediaType: 'image/png', width: 2, height: 2 })
  })

  it('fails unsupported formats and malformed bytes with the stable decode error', async () => {
    const unsupported = await sharp({
      create: { width: 1, height: 1, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } },
    }).tiff().toBuffer()
    await expect(fitImageToLimits(unsupported, { maxDimension: 2 }))
      .rejects.toMatchObject({ code: 'INVALID_IMAGE' })
    await expect(fitImageToLimits(Uint8Array.of(1, 2, 3), { maxDimension: 2 }))
      .rejects.toMatchObject({ code: 'INVALID_IMAGE' })
  })

  it('re-encodes in the input format for every supported raster', async () => {
    for (const [format, mediaType] of [
      ['png', 'image/png'],
      ['jpeg', 'image/jpeg'],
      ['webp', 'image/webp'],
      ['gif', 'image/gif'],
    ] as const) {
      const fitted = await fitImageToLimits(await raster(format), { maxDimension: 2 })
      expect(fitted.detected.mediaType).toBe(mediaType)
      await expect(detectImage(fitted.data)).resolves.toEqual(fitted.detected)
    }
  })

  it('keeps every frame of an animated GIF', async () => {
    const fitted = await fitImageToLimits(ANIMATED_GIF, { maxDimension: 2 })
    expect(fitted.detected).toEqual({ mediaType: 'image/gif', width: 2, height: 1 })
    const pages = await sharp(Buffer.from(fitted.data), { animated: true }).metadata()
    expect(pages.pages).toBe(2)
  })
})
