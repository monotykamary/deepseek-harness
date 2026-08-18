import type { Branded } from '@monotykamary/dsh-brand'
import type { ObservableSnapshot } from '@monotykamary/dsh-client-runtime/client'
import type {
  InjectFace, PropsLocale, PropsRenderSlots, PropsRuntime, PropsStore,
} from '@monotykamary/dsh-client-ui-slots'
import type { createWorkbenchStore } from './store.ts'
import type { NS } from './locales.ts'

/** Opaque id of one registered workbench surface. */
export type WorkbenchSurfaceId = Branded<'WorkbenchSurfaceId'>

/** One surface projected from the workbench slot ledger. */
export interface WorkbenchSurface {
  /** Stable slot registration id. */
  readonly id: WorkbenchSurfaceId
  /** Locale-resolved tab and launcher label. */
  readonly label: string
}

/** Registration-private live surface directory. */
export interface WorkbenchInjected {
  hooks: {
    /** Ordered workbench surface registrations with locale-resolved labels. */
    surfaces: ObservableSnapshot<readonly WorkbenchSurface[]>
  }
}

/** Full props of the workbench occupying the layout-owned Details slot. */
export type WorkbenchProps =
  & PropsRuntime<'details'>
  & PropsRenderSlots<'workbench.surface'>
  & PropsStore<ReturnType<typeof createWorkbenchStore>>
  & InjectFace<WorkbenchInjected>
  & PropsLocale<typeof NS>
