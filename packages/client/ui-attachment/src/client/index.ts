/** Browser attachment plugin: fills conversation's composer and message-image slots. */
import type { ClientContext } from '@monotykamary/dsh-client-runtime/client'
import type {} from '@monotykamary/dsh-client-ui-conversation/client'
import { ComposerAttachments } from './ComposerAttachments.tsx'
import { MessageImages } from './MessageImages.tsx'

export { AttachmentRail, type AttachmentRailItem, type AttachmentRailLabels } from '../AttachmentRail.tsx'
export { ImageLightbox, type ImageLightboxLabels } from '../ImageLightbox.tsx'
export { ImageGallery, MessageImage, type ImageLoader, type MessageImageLabels } from '../MessageImage.tsx'

/** Slot registry required by this presentation plugin. */
export const inject = ['slots']

/** Register attachment presentation; reusable pure atoms are exported without Cordis state. */
export function apply(ctx: ClientContext): void {
  ctx.slots.inject('conversation.input.attachments', () => ctx.slots.register({
    name: 'conversation.input.attachments',
    locale: 'conversation',
  }, ComposerAttachments))
  ctx.slots.inject('conversation.message.images', () => ctx.slots.register({
    name: 'conversation.message.images',
    locale: 'conversation',
  }, MessageImages))
}
