/** Raster inspection: full decode at admission, header-only probe on verified reads. */

import sharp, { type Sharp } from 'sharp'
import { AttachmentError } from '@monotykamary/dsh-attachment'
import type { ImageMediaType } from '@monotykamary/dsh-attachment'

/** Decoded metadata from a supported image. */
export interface DetectedImage {
  mediaType: ImageMediaType
  width: number
  height: number
}

const MEDIA_TYPES: Readonly<Record<string, ImageMediaType>> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
}

/** Re-encode quality for lossy formats whose raster admission had to resample. */
const RESAMPLE_QUALITY = 90

async function imageMetadata(image: Sharp): Promise<DetectedImage> {
  const metadata = await image.metadata()
  const mediaType = MEDIA_TYPES[metadata.format as string]
  if (mediaType === undefined) {
    throw new AttachmentError('Unsupported or malformed image data.', 'INVALID_IMAGE')
  }
  return { mediaType, width: metadata.width, height: metadata.height }
}

/**
 * Parse a supported raster's header and return its intrinsic metadata without
 * decoding pixels. Digest-verified reads use this: admission already proved
 * that these exact bytes decode completely, so the read path only re-derives
 * the reference fields instead of paying the full-raster decode again.
 * @param data - complete encoded image bytes.
 * @returns verified format and dimensions.
 */
export async function probeImage(data: Uint8Array): Promise<DetectedImage> {
  try {
    return await imageMetadata(sharp(data, { failOn: 'error', limitInputPixels: false }))
  } catch (error) {
    if (error instanceof AttachmentError) throw error
    throw new AttachmentError('Unsupported or malformed image data.', 'INVALID_IMAGE', { cause: error })
  }
}

/**
 * Fully decode a supported raster and return its intrinsic metadata.
 * @param data - complete encoded image bytes.
 * @returns verified format and dimensions.
 */
export async function detectImage(data: Uint8Array): Promise<DetectedImage> {
  try {
    const image = sharp(data, { failOn: 'error', limitInputPixels: false })
    const detected = await imageMetadata(image)
    await image.raw().toBuffer()
    return detected
  } catch (error) {
    if (error instanceof AttachmentError) throw error
    throw new AttachmentError('Unsupported or malformed image data.', 'INVALID_IMAGE', { cause: error })
  }
}

/** Intrinsic-dimension bounds an admitted raster may not exceed. */
export interface DecodedImageLimits {
  /** Decoded-pixel (width times height) bound. */
  maxPixels?: number
  /** Per-side bound applied to width and height independently. */
  maxDimension?: number
}

/**
 * Resample one raster so its intrinsic dimensions fit the configured bounds.
 * An image already within bounds is returned byte-for-byte after the same
 * full decode admission applies elsewhere; an oversized image is resized with
 * the larger side (and the decoded-pixel count) capped by the tighter bound,
 * re-encoded in its own format (animated GIFs keep every frame), and probed
 * again so the reported reference describes the stored bytes exactly.
 * @param data - complete encoded image bytes.
 * @param limits - intrinsic-dimension bounds; the stored raster never exceeds them.
 * @returns the bytes to persist and the metadata of those exact bytes.
 */
export async function fitImageToLimits(
  data: Uint8Array,
  limits: DecodedImageLimits,
): Promise<{ data: Uint8Array; detected: DetectedImage }> {
  try {
    const image = sharp(data, { failOn: 'error', limitInputPixels: false })
    const detected = await imageMetadata(image)
    const withinBounds = (limits.maxPixels === undefined || detected.width * detected.height <= limits.maxPixels)
      && (limits.maxDimension === undefined || Math.max(detected.width, detected.height) <= limits.maxDimension)
    if (withinBounds) {
      await image.raw().toBuffer()
      return { data, detected }
    }

    let scale = 1
    if (limits.maxDimension !== undefined) {
      scale = Math.min(scale, limits.maxDimension / Math.max(detected.width, detected.height))
    }
    if (limits.maxPixels !== undefined) {
      scale = Math.min(scale, Math.sqrt(limits.maxPixels / (detected.width * detected.height)))
    }
    let width = Math.max(1, Math.round(detected.width * scale))
    let height = Math.max(1, Math.round(detected.height * scale))
    if (limits.maxPixels !== undefined && width * height > limits.maxPixels) {
      // Rounding can leave a dimension at 1 where the pixel bound must shrink
      // the other side alone; take the exact remainder of the pixel budget.
      if (width >= height) width = Math.max(1, Math.floor(limits.maxPixels / height))
      else height = Math.max(1, Math.floor(limits.maxPixels / width))
    }

    const resized = sharp(data, {
      failOn: 'error',
      limitInputPixels: false,
      ...detected.mediaType === 'image/gif' ? { animated: true } : {},
    }).resize(width, height, { fit: 'fill' })
    switch (detected.mediaType) {
      case 'image/png':
        resized.png()
        break
      case 'image/jpeg':
        resized.jpeg({ quality: RESAMPLE_QUALITY })
        break
      case 'image/webp':
        resized.webp({ quality: RESAMPLE_QUALITY })
        break
      case 'image/gif':
        resized.gif()
        break
    }
    const output = await resized.toBuffer()
    // The output keeps the input format, so the header-only probe reports the
    // first-page dimensions of exactly the stored bytes (animated GIFs report
    // their logical screen, matching what non-animated decodes see).
    const fitted = await imageMetadata(sharp(output, { failOn: 'error', limitInputPixels: false }))
    return { data: new Uint8Array(output), detected: fitted }
  } catch (error) {
    if (error instanceof AttachmentError) throw error
    throw new AttachmentError('Unsupported or malformed image data.', 'INVALID_IMAGE', { cause: error })
  }
}
