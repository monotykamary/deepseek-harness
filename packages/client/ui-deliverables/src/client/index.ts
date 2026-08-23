/**
 * Deliverables plugin, browser half: registers the changed-files card into
 * the chat view's turn-tail chain, and provides the `chatFileMentions`
 * service that links inline-code mentions of produced files in the closing
 * prose. All policy lives here — receipt projection, changed-file hierarchy,
 * mention matching, and workbench navigation — so composing this plugin out
 * of cordis.yml removes both surfaces entirely;
 * the owning view renders an empty chain and inert prose at zero cost.
 */
import type { ClientContext } from '@monotykamary/dsh-client-runtime/client'
import type { ChatFileMentions } from '@monotykamary/dsh-client-ui-conversation/client'
import type { WorkbenchSurfaceId } from '@monotykamary/dsh-client-ui-workbench/client'
import type {} from '@monotykamary/dsh-client-locale/client'
import { ChangesPanel } from './ChangesPanel.tsx'
import { ProducedFiles } from './ProducedFiles.tsx'
import { en, NS, zh, type DeliverablesKey } from './locales.ts'
import { deliverablesViewDefinition } from './deliverables-view.ts'
import {
  deliverablesDefinition, producedFileMentions, selectProducedFiles,
} from './turn-deliverables.ts'

declare module '@monotykamary/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Produced-files row copy. */
    'deliverables': DeliverablesKey
  }
}

export {
  ProducedFiles, ProducedFilesCard, type ProducedFilesCardLabels, type ProducedFilesCardProps, type ProducedFilesProps,
} from './ProducedFiles.tsx'
export { producedForClosing, type DeliverableChange } from './turn-deliverables.ts'

const CHANGES_SURFACE_ID = 'changes' as WorkbenchSurfaceId

/** Required services for projections, workbench navigation, slots, and dictionaries. */
export const inject = ['slots', 'locale', 'conversationEvents', 'conversationViews', 'workbench']

/**
 * Client plugin body: register the dictionaries and the turn-tail entry.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.conversationEvents.register(deliverablesDefinition)
  ctx.conversationViews.register(deliverablesViewDefinition)
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-deliverables: dictionaries')
  const t = ctx.locale.bind(NS)
  ctx.slots.inject(
    'conversation.chat.turnTail',
    () => ctx.slots.register({
      name: 'conversation.chat.turnTail',
      select: selectProducedFiles,
      locale: NS,
      inject: () => ({
        openChanges: () => { ctx.workbench.open(CHANGES_SURFACE_ID) },
      }),
    }, ProducedFiles),
  )
  ctx.effect(() => ctx.workbench.registerPresentation(CHANGES_SURFACE_ID, {
    icon: 'changes',
    description: () => t('changes.description'),
  }), 'ui-deliverables: Changes workbench presentation')
  ctx.slots.inject('workbench.surface', () => ctx.slots.register({
    name: 'workbench.surface',
    id: CHANGES_SURFACE_ID,
    order: 10,
    label: () => t('changes.tab'),
    locale: NS,
  }, ChangesPanel))
  // The prose side of the same vocabulary: the chat view reaches this face
  // via ctx.get, so its absence — this plugin composed out — is the off state.
  const mentions: ChatFileMentions = {
    forClosing(owner) {
      // Same claim test the turn-tail chain entry runs: no produced files,
      // no vocabulary — the two surfaces agree by construction.
      const match = selectProducedFiles(owner)
      if (match === null || match.paths.length === 0) return undefined
      return producedFileMentions(match.paths, owner.openFile, path => t('produced.open', { name: path }))
    },
  }
  ctx.provide('chatFileMentions', mentions)
}
