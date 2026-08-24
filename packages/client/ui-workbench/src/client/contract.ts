import type { Branded } from '@monotykamary/dsh-brand'
import type { ObservableSnapshot } from '@monotykamary/dsh-client-runtime/client'
import type {
  InjectFace, PropsLocale, PropsRenderSlots, PropsRuntime, PropsStore,
} from '@monotykamary/dsh-client-ui-slots'
import type { createWorkbenchStore } from './store.ts'
import type { NS } from './locales.ts'

/** Opaque id of one registered workbench surface. */
export type WorkbenchSurfaceId = Branded<'WorkbenchSurfaceId'>

/** Icon vocabulary rendered by the workbench shell for registered surfaces. */
export type WorkbenchSurfaceIcon = 'inspect' | 'changes' | 'files' | 'terminal' | 'generic'

/** Plugin-owned presentation registered beside one workbench surface. */
export interface WorkbenchSurfacePresentation {
  /** Stable shell-rendered icon kind. */
  readonly icon: WorkbenchSurfaceIcon
  /** Locale-aware launcher description. */
  readonly description: string | (() => string)
  /** Let this surface own the top chrome while it is the only open Workbench panel. */
  readonly immersive?: boolean
  /** Allow several independently mounted panels backed by this surface. */
  readonly repeatable?: boolean
}

/** One surface projected from the workbench slot ledger. */
export interface WorkbenchSurface {
  /** Stable slot registration id. */
  readonly id: WorkbenchSurfaceId
  /** Locale-resolved tab and launcher label. */
  readonly label: string
  /** Shell-rendered icon kind, or `generic` without plugin presentation metadata. */
  readonly icon: WorkbenchSurfaceIcon
  /** Locale-resolved launcher description; empty without plugin presentation metadata. */
  readonly description: string
  /** Whether the surface owns top chrome when opened alone. */
  readonly immersive: boolean
  /** Whether the Workbench may create several independent panel instances. */
  readonly repeatable: boolean
}

/** Registration-private live surface directory. */
export interface WorkbenchInjected {
  hooks: {
    /** Ordered workbench surface registrations with locale-resolved labels. */
    surfaces: ObservableSnapshot<readonly WorkbenchSurface[]>
  }
  /**
   * Bind this mounted Workbench's Session actions for its component lifetime.
   * @returns disposer for this exact action binding.
   */
  attach: () => () => void
}

/** Owner props identifying one mounted Workbench panel instance. */
export interface WorkbenchSurfaceOwnerProps {
  /** Stable ordinal for repeatable surfaces; singleton surface components may omit it in direct use. */
  readonly workbenchPanelOrdinal?: number
}

/** Full props of the workbench occupying the layout-owned Details slot. */
export type WorkbenchProps =
  & PropsRuntime<'details'>
  & PropsRenderSlots<'workbench.surface'>
  & PropsStore<ReturnType<typeof createWorkbenchStore>>
  & InjectFace<WorkbenchInjected>
  & PropsLocale<typeof NS>
