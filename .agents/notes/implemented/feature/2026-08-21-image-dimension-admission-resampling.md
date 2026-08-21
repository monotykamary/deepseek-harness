# Agent Note: Admission resampling of oversized images

Status: implemented

English | [中文](2026-08-21-image-dimension-admission-resampling.zh.md)

## Problem

Image admission refused any raster whose side exceeded `maxImageDimension` (default 2000px) or whose decoded pixels exceeded `maxImagePixels` (default 40M): the refusal kept provider-rejected images out of durable history, and the model or user had to downscale and retry. In practice every oversized `read_image` and every oversized upload turned into a recoverable error, while the pi coding agent shrinks images before sending them to the model — the behavior this decision makes parity with.

## Decision

`LocalAttachmentStore` resamples an admitted image into the configured bounds instead of refusing. `fitImageToLimits` (attachment-local `src/image.ts`) fully decodes the raster, and when either bound is exceeded resizes it under a uniform scale (taking the pixel bound's exact remainder when one side is already at its minimum), re-encodes it in its own format — PNG lossless, JPEG/WebP at quality 90, animated GIFs with every frame preserved via sharp's `animated` input — and the save path commits those bytes. The reference, the `read_image` envelope, and the attachment RPC all describe the stored raster exactly. `validateImageFile` still proves the input decodes completely and declares its real format; dimension and pixel bounds are no longer admission failures. Every producer that commits through the attachment seam (host uploads, MCP tool images, ACP content, `read_image`) gets the same behavior, so durable history never carries a raster a deployed model route rejects. `IMAGE_DIMENSION_TOO_LARGE` and `IMAGE_TOO_MANY_PIXELS` remain wire codes for other stores; the byte limit still refuses instead of resampling.

## Alternatives considered

- **Keep refusal and require manual downscaling.** The prior decision ([archived](../../archived/bug-fix/2026-08-17-image-dimension-admission-limit.md)): it turns every oversized image into a recoverable tool error or rejected upload, and leaves the model to orchestrate its own downscale without a guarantee the result stays within bounds.
- **Downscale per request at the provider adapter.** Too late: by request time the image is already durable history, so every route and every retry re-fails; it would also repeat decode and resize on every request and let the envelope's reported dimensions diverge from what the model receives.
- **Config-gated downscale.** A switch whose default either preserves the refusal this change removes or hides the pi-equivalent behavior; the limits themselves are already the deployment knob for quality-versus-compatibility.

## Consequences

- An oversized image rides durable history resampled into the configured bounds, so provider-side dimension rejections cannot poison a session.
- The stored raster differs from what the caller supplied when resampling fires; the reference and envelope always report the stored raster's true dimensions, keeping model-visible metadata truthful.
- JPEG/WebP lossy re-encode at quality 90; deployments that need original detail raise the limits instead.
- The per-image byte limit still refuses, keeping intake bandwidth bounded.
- Sessions admitted before this change that already carry an oversized image remain broken; resampling does not repair existing history.

## Testing

attachment-local `image.spec.ts` pins the resampling math (unchanged bytes within bounds, per-side downscale, pixel-bound remainder, format preservation, animated-GIF frame count), `store.spec.ts` pins the committed resampled object and its read-back, tool-fs `read-image.spec.ts` pins the downscaled tool result and envelope, and the `read-image-downscale` snapshot scenario replays the resampled 2000x1 raster through the assembled app.

## Related

- [Archived: per-side image dimension admission limit](../../archived/bug-fix/2026-08-17-image-dimension-admission-limit.md) — the refusal decision this replaces.
- [Minimal read_image tool](../feature/2026-08-10-minimal-read-image-tool.md) — the tool whose admission policy this changes.
- [Web image intake and limits alignment](../feature/2026-08-12-web-image-intake-and-limits-alignment.md) — the composer-side surfacing of the same `ImageAttachmentLimits`.
