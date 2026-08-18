/** Client plugin registering the frame-wide command palette. */
import type { ClientContext } from '@monotykamary/dsh-client-runtime/client'
import type {} from '@monotykamary/dsh-client-locale/client'
import type { CommandPaletteInjected } from './contract.ts'
import { CommandPalette } from './CommandPalette.tsx'
import { en, zh, type CommandPaletteKey } from './locales.ts'

export type { CommandPaletteInjected, CommandPaletteProps } from './contract.ts'
export type { CommandPaletteKey } from './locales.ts'

declare module '@monotykamary/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Global command-palette copy. */
    commandPalette: CommandPaletteKey
  }
}

const NS = 'commandPalette'

/** Required services used by registration and the injected domain callbacks. */
export const inject = ['slots', 'sessions', 'workspaces', 'locale']

/** Register the command palette after the layout declares `shell.overlay`. */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-command-palette: dictionaries')

  const injected = (): CommandPaletteInjected => ({
    openSession: (sessionId) => { ctx.sessions.open(sessionId) },
    startSession: async (workspaceId) => {
      if (workspaceId === undefined) {
        ctx.workspaces.startSession()
        return
      }
      const sessionId = await ctx.workspaces.connectWorkspace(workspaceId)
      ctx.sessions.open(sessionId)
    },
    searchSessions: async (query, signal) => {
      const result = await ctx.sessions.search(query, signal)
      if (!result.ok) throw new Error(result.error.message)
      return result.value
    },
    searchResultLimit: ctx.sessions.searchResultLimit,
  })

  ctx.slots.inject('shell.overlay', () => ctx.slots.register(
    { name: 'shell.overlay', id: 'command-palette', inject: injected, locale: NS },
    CommandPalette,
  ))
}
