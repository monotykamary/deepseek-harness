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
import type { ClientContext } from '@monotykamary/dsh-client-runtime/client'
import type { WorkbenchSurfaceId } from '@monotykamary/dsh-client-ui-workbench/client'
import type {} from '@monotykamary/dsh-client-ui-conversation/client'
import type {} from '@monotykamary/dsh-client-ui-layout/client'
import type {} from '@monotykamary/dsh-client-locale/client'
import { BottomTerminalToggle } from './BottomTerminalToggle.tsx'
import { BottomTerminal, WorkbenchTerminal } from './TerminalPanel.tsx'
import type { BottomTerminalToggleInjected, TerminalInjected } from './contract.ts'
import { en, NS, zh, type TerminalKey } from './locales.ts'
import { TerminalPreferenceStore } from './preferences.ts'

export type { TerminalPreferences, TerminalFontId, TerminalThemeId } from './preferences.ts'

const TERMINAL_SURFACE_ID = 'terminal' as WorkbenchSurfaceId

declare module '@monotykamary/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Interactive terminal controls and settings copy. */
    terminal: TerminalKey
  }
}

/** Required services for slots, locale, workbench navigation, and layout panel actions. */
export const inject = ['slots', 'locale', 'workbench', 'layout']

/** Register right-workbench and bottom-panel terminals with shared browser-local preferences. */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-terminal: dictionaries')
  const t = ctx.locale.bind(NS)
  const preferences = new TerminalPreferenceStore()
  const restoredWorkbenchSessions = new Set<string>()
  ctx.effect(() => () => { preferences.dispose() }, 'ui-terminal: preference subscriptions')

  const terminalInjected = (sessionId: string): TerminalInjected => ({
    hooks: { preferences },
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
