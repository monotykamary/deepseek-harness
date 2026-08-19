/** Host registration for the Workspace browser's settled-session policy. */

import type { Context } from '@monotykamary/cordis'
import z from '@monotykamary/schemastery'
import { settingsNamespace } from '@monotykamary/dsh-settings'
import { WORKSPACE_SETTINGS_NAMESPACE } from './settled-settings.ts'

export {
  AUTO_SETTLE_AFTER_DAYS_FIELD, AUTO_SETTLE_INACTIVE_FIELD,
  SHIPPED_WORKSPACE_SETTINGS, WORKSPACE_SETTINGS_NAMESPACE, type WorkspaceSettings,
} from './settled-settings.ts'

/** Cordis configuration and user-settings base for inactivity settlement. */
export interface Config {
  /** Whether inactivity moves eligible Sessions into the shelf (default true). */
  autoSettleInactive?: boolean
  /** Whole inactive days before an eligible Session enters the shelf (1–90, default 3). */
  autoSettleAfterDays?: number
}

/** Validated Cordis configuration. */
export const Config: z<Config> = z.object({
  autoSettleInactive: z.boolean().default(true),
  autoSettleAfterDays: z.number().step(1).min(1).max(90).default(3),
})

const WORKSPACE_NAMESPACE = settingsNamespace(WORKSPACE_SETTINGS_NAMESPACE)

/**
 * Register the settled-session policy when the optional settings service is composed.
 * @param ctx - Host plugin context.
 * @param config - validated composition base overridden by the user settings document.
 */
export function apply(ctx: Context, config: Config): void {
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.register(WORKSPACE_NAMESPACE, Config, { base: config })
  })
}
