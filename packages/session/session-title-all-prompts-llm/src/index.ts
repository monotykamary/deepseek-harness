/** All-human-messages model provider for `ctx.sessionTitle`. */

import type { Context } from '@monotykamary/cordis'
import z from '@monotykamary/schemastery'
import {
  registerSessionTitleLlmSettingsProvider,
  SESSION_TITLE_LLM_SETTINGS_NAMESPACE,
  SessionTitleLlmConfigFields,
} from '@monotykamary/dsh-session-title-llm'
import type { SessionTitleLlmConfig } from '@monotykamary/dsh-session-title-llm'

export const name = 'session-title-all-prompts-llm'
export const inject = ['sessionTitle', 'llm', 'sessions']

/** Required LLM policy; the automatic-title opt-in defaults to off. */
export type Config = SessionTitleLlmConfig
/** Loader schema shared with the first-prompt provider. */
/* jscpd:ignore-start -- Loader requires each plugin to export its own statically walkable schema; the field validators remain shared. */
export const Config: z<Config> = z.object({
  enabled: SessionTitleLlmConfigFields.enabled,
  targetWords: SessionTitleLlmConfigFields.targetWords,
  targetCjkCharacters: SessionTitleLlmConfigFields.targetCjkCharacters,
  maxInputBytes: SessionTitleLlmConfigFields.maxInputBytes,
  maxOutputTokens: SessionTitleLlmConfigFields.maxOutputTokens,
  timeoutMs: SessionTitleLlmConfigFields.timeoutMs,
  provider: SessionTitleLlmConfigFields.provider,
  model: SessionTitleLlmConfigFields.model,
})
/* jscpd:ignore-end */

/**
 * Register the all-prompts model provider under the user-settings opt-in.
 * @param ctx - context exposing session-title, LLM, session, and settings services.
 * @param config - required route, target, byte, token, and timeout policy.
 */
export function apply(ctx: Context, config: Config): void {
  registerSessionTitleLlmSettingsProvider(ctx, SESSION_TITLE_LLM_SETTINGS_NAMESPACE, config, name, 'all-prompts', messages => messages)
}
