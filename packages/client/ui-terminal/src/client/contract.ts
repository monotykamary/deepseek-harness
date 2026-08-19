import type { ObservableSnapshot } from '@monotykamary/dsh-client-runtime/client'
import type {
  InjectFace, PropsLocale, PropsRuntime,
} from '@monotykamary/dsh-client-ui-slots'
import type { TerminalWebSocketFactory } from './connection.ts'
import type { NS } from './locales.ts'
import type { TerminalPreferences } from './preferences.ts'

/** Shared injected state and actions for both terminal placements. */
export interface TerminalInjected {
  hooks: {
    /** Browser-local appearance settings shared by mounted terminal surfaces. */
    preferences: ObservableSnapshot<TerminalPreferences>
  }
  /** Merge one validated appearance update. */
  updatePreferences: (patch: Partial<TerminalPreferences>) => void
  /** Restore package appearance defaults. */
  resetPreferences: () => void
  /** Same-origin WebSocket constructor seam. */
  socketFactory: TerminalWebSocketFactory
  /** Open a new right-side terminal as another Workbench panel. */
  openWorkbenchPanel: () => void
  /** Ensure restored right-side terminals have one Workbench panel each. */
  ensureWorkbenchPanels: (count: number) => void
}

/** Props of the terminal occupying the right workbench surface. */
export type WorkbenchTerminalProps =
  & PropsRuntime<'workbench.surface'>
  & InjectFace<TerminalInjected>
  & PropsLocale<typeof NS>

/** Props of the terminal occupying the layout bottom panel. */
export type BottomTerminalProps =
  & PropsRuntime<'bottom-panel'>
  & InjectFace<TerminalInjected>
  & PropsLocale<typeof NS>

/** Injected Session-header gesture for the bottom terminal panel. */
export interface BottomTerminalToggleInjected {
  /** Toggle bottom-panel visibility while preserving a live attachment. */
  toggleBottomTerminal: () => void
}

/** Props of the Session-header bottom-terminal toggle. */
export type BottomTerminalToggleProps =
  & PropsRuntime<'conversation.session.header.utilities'>
  & InjectFace<BottomTerminalToggleInjected>
  & PropsLocale<typeof NS>
