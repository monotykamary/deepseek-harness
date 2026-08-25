/** Shared environment for release checks that run installed artifacts outside the checkout. */

import { resolve } from 'node:path'

/**
 * Remove host hooks and isolate mutable Harness state for an installed consumer.
 * @param consumerRoot - Throwaway consumer directory.
 * @returns Child-process environment.
 */
export function consumerEnvironment(consumerRoot: string): NodeJS.ProcessEnv {
  const environment = { ...process.env }
  delete environment.npm_config_user_agent
  delete environment.NPM_CONFIG_USER_AGENT
  delete environment.NODE_OPTIONS
  delete environment.NODE_PATH
  environment.DSH_HOME = resolve(consumerRoot, '.dsh')
  environment.DSH_AGENTS_HOME = resolve(consumerRoot, '.agents')
  return environment
}
