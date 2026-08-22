/** Official DeepSeek Harness occupants for the generic browser-brand slots. */
import type { ClientContext } from '@monotykamary/dsh-client-runtime/client'
import type { ConnectionHandle } from '@monotykamary/dsh-api-remotes/client'
import type {} from '@monotykamary/dsh-client-ui-conversation/client'
import type {} from '@monotykamary/dsh-client-ui-sidebar/client'
import type {} from '@monotykamary/dsh-client-ui-settings/client'
import type {} from '@monotykamary/dsh-client-locale/client'
import { OfficialBrandMark, OfficialBrandName } from './Brand.tsx'
import { Welcome } from './Welcome.tsx'
import { WelcomeController } from './welcome-controller.ts'
import { en, zh, type WelcomeKey } from './locales.ts'

declare module '@monotykamary/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Official DeepSeek Harness welcome copy. */
    officialBrand: WelcomeKey
  }
}

const NS = 'officialBrand'

/** Required services: the UI slot registry and locale runtime. */
export const inject = ['slots', 'locale', 'connection']

/**
 * Fill the shipped brand and welcome slots through declaration-aware registrations.
 * @param ctx - Client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-brand-official: dictionaries')
  const connection = ctx.get('connection') as ConnectionHandle
  const controller = new WelcomeController(connection.api, connection.isLoopback ? 'host' : 'memory')
  ctx.slots.inject('settings.onboarding', () => ctx.slots.register({
    name: 'settings.onboarding',
    id: 'official-welcome',
    order: -100,
    locale: NS,
    inject: () => ({ controller }),
  }, Welcome))
  if (process.env.DSH_CLIENT_BUILD_PROFILE !== 'official') return
  ctx.slots.inject('sidebar.brand.mark', () =>
    ctx.slots.inject('sidebar.brand.name', () =>
      ctx.slots.inject('conversation.hero.brand.mark', function* () {
        yield ctx.slots.register({ name: 'sidebar.brand.mark' }, OfficialBrandMark)
        yield ctx.slots.register({ name: 'sidebar.brand.name' }, OfficialBrandName)
        yield ctx.slots.register({ name: 'conversation.hero.brand.mark' }, OfficialBrandMark)
      })))
}
