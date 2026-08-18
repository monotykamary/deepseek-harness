/** Browser plugin providing the tabbed Details workbench. */
import type { ClientContext } from '@monotykamary/dsh-client-runtime/client'
import type {} from '@monotykamary/dsh-client-locale/client'
import type {} from '@monotykamary/dsh-client-ui-layout/client'
import type { WorkbenchInjected } from './contract.ts'
import { Workbench } from './Workbench.tsx'
import { WorkbenchSurfaceDirectory } from './surface-directory.ts'
import { WorkbenchController } from './service.ts'
import { createWorkbenchStore } from './store.ts'
import { en, NS, zh, type WorkbenchKey } from './locales.ts'

export type { IWorkbench } from './service.ts'
export type { WorkbenchKey } from './locales.ts'
export type { WorkbenchSurface, WorkbenchSurfaceId } from './contract.ts'

declare module '@monotykamary/cordis' {
  interface Context {
    /** Session-scoped right-panel surface navigation. */
    workbench: import('./service.ts').IWorkbench
  }
}

declare module '@monotykamary/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Workbench shell and tab controls. */
    workbench: WorkbenchKey
  }

  interface SlotMap {
    /**
     * One independently registered right-panel surface. Entries are available
     * to the workbench launcher and render only when their tab is active.
     */
    'workbench.surface': { kind: 'list'; scope: 'session' }
  }
}

/** Services required by the workbench shell and navigation controller. */
export const inject = ['slots', 'layout', 'locale']

/**
 * Register the workbench as the layout Details occupant.
 * @param ctx - client context carrying slots, layout, and locale.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-workbench: dictionaries')
  const surfaces = new WorkbenchSurfaceDirectory(ctx.slots, ctx.locale)
  const controller = new WorkbenchController(ctx.layout, surfaces)

  ctx.effect(() => {
    const stopDirectory = surfaces.start()
    const disposeService = ctx.reflect.provide('workbench', controller)
    const disposeSlot = ctx.slots.inject('details', () => ctx.slots.register({
      name: 'details',
      children: {
        'workbench.surface': { kind: 'list', scope: 'session' },
      },
      store: createWorkbenchStore,
      locale: NS,
      inject: (_sessionId, actions): WorkbenchInjected => {
        controller.attach(actions)
        return { hooks: { surfaces } }
      },
    }, Workbench))
    return () => {
      disposeSlot()
      stopDirectory()
      void disposeService()
    }
  }, 'ui-workbench: service + Details registration')
}
