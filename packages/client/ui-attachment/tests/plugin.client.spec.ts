import { Context } from '@monotykamary/cordis'
import { describe, expect, it } from 'vitest'
import { SlotRegistry } from '@monotykamary/dsh-client-runtime/client'
import { apply as applyHost } from '../src/index.ts'
import {
  AttachmentRail as PublicAttachmentRail, ImageGallery as PublicImageGallery,
  ImageLightbox as PublicImageLightbox, MessageImage as PublicMessageImage, apply, inject,
} from '../src/client/index.ts'
import { AttachmentRail } from '../src/AttachmentRail.tsx'
import { ImageLightbox } from '../src/ImageLightbox.tsx'
import { ImageGallery, MessageImage } from '../src/MessageImage.tsx'
import { ComposerAttachments } from '../src/client/ComposerAttachments.tsx'
import { MessageImages } from '../src/client/MessageImages.tsx'

async function bench() {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  ctx.slots.register({
    name: 'root',
    children: {
      'conversation.input.attachments': { kind: 'single', scope: 'session-maybe' },
      'conversation.message.images': { kind: 'single', scope: 'session' },
    },
  } as never, () => null)
  const fiber = ctx.plugin({ inject: [...inject], apply })
  await fiber.await()
  return { ctx, fiber }
}

describe('attachment plugin', () => {
  it('keeps the host half empty and publishes the pure preview atoms', () => {
    expect(() => { applyHost() }).not.toThrow()
    expect(PublicAttachmentRail).toBe(AttachmentRail)
    expect(PublicImageLightbox).toBe(ImageLightbox)
    expect(PublicImageGallery).toBe(ImageGallery)
    expect(PublicMessageImage).toBe(MessageImage)
  })

  it('registers both entries and removes them with the plugin fiber', async () => {
    const { ctx, fiber } = await bench()
    expect(inject).toEqual(['slots'])
    expect(ctx.slots.entries('conversation.input.attachments')).toMatchObject([{
      locale: 'conversation',
      component: ComposerAttachments,
    }])
    expect(ctx.slots.entries('conversation.message.images')).toMatchObject([{
      locale: 'conversation',
      component: MessageImages,
    }])

    await fiber.dispose()

    expect(ctx.slots.entries('conversation.input.attachments')).toHaveLength(0)
    expect(ctx.slots.entries('conversation.message.images')).toHaveLength(0)
  })
})
