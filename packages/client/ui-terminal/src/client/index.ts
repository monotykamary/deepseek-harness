/** Browser plugin registering interactive terminals in the workbench and bottom panel. */

import '@fontsource/geist-mono/latin-400.css'
import '@fontsource/geist-mono/latin-700.css'
import '@fontsource/anonymous-pro/latin-400.css'
import '@fontsource/anonymous-pro/latin-700.css'
import '@fontsource/dm-mono/latin-400.css'
import '@fontsource/dm-mono/latin-500.css'
import '@fontsource/fira-code/latin-400.css'
import '@fontsource/fira-code/latin-700.css'
import '@fontsource/ibm-plex-mono/latin-400.css'
import '@fontsource/ibm-plex-mono/latin-700.css'
import '@fontsource/inconsolata/latin-400.css'
import '@fontsource/inconsolata/latin-700.css'
import '@fontsource/jetbrains-mono/latin-400.css'
import '@fontsource/jetbrains-mono/latin-700.css'
import '@fontsource/roboto-mono/latin-400.css'
import '@fontsource/roboto-mono/latin-700.css'
import '@fontsource/source-code-pro/latin-400.css'
import '@fontsource/source-code-pro/latin-700.css'
import '@fontsource/space-mono/latin-400.css'
import '@fontsource/space-mono/latin-700.css'
import '@fontsource/ubuntu-mono/latin-400.css'
import '@fontsource/ubuntu-mono/latin-700.css'
import './xterm.global.css'
import type { ClientContext, ObservableSnapshot } from '@monotykamary/dsh-client-runtime/client'
import type { WorkbenchSurfaceId } from '@monotykamary/dsh-client-ui-workbench/client'
import type {} from '@monotykamary/dsh-client-ui-conversation/client'
import type {} from '@monotykamary/dsh-client-ui-layout/client'
import type {} from '@monotykamary/dsh-client-locale/client'
// Type-only: pulls the theme plugin's Context merge (ctx.theme); cross-plugin
// collaboration goes through the service, never a value import.
import type { ThemeSnapshot } from '@monotykamary/dsh-client-ui-theme/client'
import { BottomTerminalToggle } from './BottomTerminalToggle.tsx'
import { BottomTerminal, WorkbenchTerminal } from './TerminalPanel.tsx'
import type { BottomTerminalToggleInjected, TerminalInjected } from './contract.ts'
import { en, NS, zh, type TerminalKey } from './locales.ts'
import { TerminalPreferenceStore } from './preferences.ts'
import type { TerminalColorScheme } from './themes.ts'

export type { TerminalPreferences, TerminalFontId } from './preferences.ts'
export type { TerminalColorScheme } from './themes.ts'

const TERMINAL_SURFACE_ID = 'terminal' as WorkbenchSurfaceId

declare module '@monotykamary/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Interactive terminal controls and settings copy. */
    terminal: TerminalKey
  }
}

/** Required services for slots, locale, workbench navigation, layout panel actions, and appearance. */
export const inject = ['slots', 'locale', 'workbench', 'layout', 'theme']

/**
 * Live resolved app color scheme (light/dark/system folded to a palette
 * choice) shared by every mounted terminal surface, so the terminal follows
 * the app appearance instead of a user-chosen terminal theme.
 */
class TerminalColorSchemeSource implements ObservableSnapshot<TerminalColorScheme> {
  private value: TerminalColorScheme
  private readonly listeners = new Set<() => void>()

  constructor(ctx: ClientContext) {
    this.value = this.resolve(ctx.theme.getTheme())
    ctx.effect(() => ctx.on('theme/change', (snapshot) => {
      const next = this.resolve(snapshot)
      if (next === this.value) return
      this.value = next
      for (const listener of this.listeners) listener()
    }), 'ui-terminal: appearance color scheme sync')
  }

  private resolve(snapshot: ThemeSnapshot): TerminalColorScheme {
    return snapshot.active.colorScheme
  }

  getSnapshot = (): TerminalColorScheme => this.value

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }
}

/** Register right-workbench and bottom-panel terminals with shared browser-local preferences. */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-terminal: dictionaries')
  const t = ctx.locale.bind(NS)
  const preferences = new TerminalPreferenceStore()
  const colorScheme = new TerminalColorSchemeSource(ctx)
  const restoredWorkbenchSessions = new Set<string>()
  ctx.effect(() => () => { preferences.dispose() }, 'ui-terminal: preference subscriptions')

  const terminalInjected = (sessionId: string): TerminalInjected => ({
    hooks: { preferences, colorScheme },
    updatePreferences: (patch) => { preferences.update(patch) },
    resetPreferences: () => { preferences.reset() },
    socketFactory: url => new WebSocket(url),
    openWorkbenchPanel: () => { ctx.workbench.openNew(TERMINAL_SURFACE_ID) },
    ensureWorkbenchPanels: (count) => {
      if (restoredWorkbenchSessions.has(sessionId)) return
      ctx.workbench.ensureCount(TERMINAL_SURFACE_ID, count)
      restoredWorkbenchSessions.add(sessionId)
    },
  })

  ctx.effect(() => ctx.workbench.registerPresentation(TERMINAL_SURFACE_ID, {
    icon: 'terminal',
    description: () => t('launcher.description'),
    repeatable: true,
  }), 'ui-terminal: workbench presentation')

  ctx.slots.inject('workbench.surface', () => ctx.slots.register({
    name: 'workbench.surface',
    id: TERMINAL_SURFACE_ID,
    order: 30,
    label: () => t('surface'),
    locale: NS,
    inject: terminalInjected,
  }, WorkbenchTerminal))

  ctx.slots.inject('bottom-panel', () => ctx.slots.register({
    name: 'bottom-panel',
    locale: NS,
    inject: terminalInjected,
  }, BottomTerminal))

  ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({
    name: 'conversation.session.header.utilities',
    id: 'bottom-terminal',
    order: 90,
    locale: NS,
    inject: (): BottomTerminalToggleInjected => ({
      toggleBottomTerminal: () => { ctx.layout.toggleBottom() },
    }),
  }, BottomTerminalToggle))
}
