/** Settings page and trigger badge for DSH distribution updates. */

import type { ClientContext } from '@monotykamary/dsh-client-runtime/client'
import type {} from '@monotykamary/dsh-client-locale/client'
import type {} from '@monotykamary/dsh-client-ui-settings/client'
import { InstallationReadiness, UpdateBadge, UpdateSettings, type UpdateInjected } from './UpdateSettings.tsx'
import { en, zh, type UpdateLocaleKey } from './locales.ts'

export type { InstallationReadinessProps, UpdateInjected, UpdateSettingsProps, UpdateBadgeProps } from './UpdateSettings.tsx'
export type { UpdateLocaleKey } from './locales.ts'

declare module '@monotykamary/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'settings.updates': UpdateLocaleKey
  }
}

/** Locale namespace owned by the Updates settings page. */
export const NS = 'settings.updates'
export const inject = ['slots', 'locale', 'remote', 'remote.distributionUpdate']

/** Register the Updates page and available-update badge. */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { en, zh }), 'ui-settings-updates: dictionaries')
  const unwrap = async <T>(
    request: Promise<{ ok: true; value: T } | { ok: false; error: { code: string; message: string } }>,
  ): Promise<T> => {
    const result = await request
    if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`)
    return result.value
  }
  const injected: UpdateInjected = {
    snapshot: () => unwrap(ctx.remote.distributionUpdate.snapshot()),
    check: () => unwrap(ctx.remote.distributionUpdate.check()),
    start: () => unwrap(ctx.remote.distributionUpdate.start()),
  }
  const t = ctx.locale.bind(NS)
  ctx.slots.inject('settings.onboarding', () => ctx.slots.register({
    name: 'settings.onboarding',
    id: 'installation-readiness',
    order: -50,
    locale: NS,
    inject: () => ({ snapshot: injected.snapshot }),
  }, InstallationReadiness))
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'updates',
    order: 40,
    label: () => t('nav'),
    locale: NS,
    inject: () => injected,
  }, UpdateSettings))
  ctx.slots.inject('settings.trigger.badge', () => ctx.slots.register({
    name: 'settings.trigger.badge', inject: () => ({ check: injected.check }),
  }, UpdateBadge))
}
