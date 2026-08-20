/**
 * Session-title preference surface, browser half. Owns the General settings
 * row that opts automatic LLM session titles in or out; the Host-side
 * session-title provider mounts from the same `session-title-llm` namespace.
 */
import type { ClientContext } from '@monotykamary/dsh-client-runtime/client'
import type {} from '@monotykamary/dsh-client-locale/client'
import type {} from '@monotykamary/dsh-client-ui-settings/client'
import type {} from '@monotykamary/dsh-api-remotes/client'
import { SessionTitlePreference } from './preference.ts'
import { SessionTitleRow } from './SessionTitleRow.tsx'
import type { SessionTitleRowInjected } from './SessionTitleRow.tsx'
import { en, zh } from './locales.ts'
import type { SessionTitleKey } from './locales.ts'

/** Dictionary namespace owned by this plugin. */
export const NS = 'settings.sessionTitle'

declare module '@monotykamary/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The automatic session-title row's copy. */
    'settings.sessionTitle': SessionTitleKey
  }
}

/**
 * Settings namespace owned by the host session-title provider plugins. The
 * literal is restated here because the client bundle purity gate forbids
 * value imports across plugin packages (the web-search card precedent).
 */
export const SESSION_TITLE_SETTINGS_NAMESPACE = 'session-title-llm'

/** Required services (cordis fiber inject). */
export const inject = ['slots', 'locale', 'connection', 'remote', 'settingsScope']

/**
 * Mount the session-title preference row.
 * @param ctx - the browser plugin context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-session-title: row dictionaries')
  const preference = new SessionTitlePreference(
    ctx.settingsScope.bind<{ enabled: boolean }>({ namespace: SESSION_TITLE_SETTINGS_NAMESPACE }),
  )
  ctx.slots.inject('settings.general.item', () => ctx.slots.register({
    name: 'settings.general.item',
    id: 'session-title',
    order: 30,
    locale: NS,
    inject: (): SessionTitleRowInjected => ({
      hooks: { enabled: preference.enabled },
      setEnabled: (enabled) => { preference.setEnabled(enabled) },
    }),
  }, SessionTitleRow))
}
