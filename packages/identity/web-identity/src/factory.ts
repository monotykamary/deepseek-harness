/**
 * Build the configured identity provider. `header` ignores the deps (the
 * proxy owns the login); `passkey` uses them for the signed session cookie
 * and the user/credential stores. The switch is exhaustive over the
 * `IdentityConfig` union, so adding a variant is a new case here + a new
 * schema member.
 * @module @monotykamary/dsh-web-identity/factory
 */

import { createHeaderIdentityProvider } from './header-provider.ts'
import { createPasskeyIdentityProvider } from './passkey-routes.ts'
import type { IdentityConfig, IdentityProvider, IdentityProviderDeps } from './types.ts'

/**
 * Build the provider named by the config.
 * @param config - the validated identity configuration.
 * @param deps - server-owned resources the provider needs.
 * @returns the provider.
 */
export function createIdentityProvider(
  config: IdentityConfig,
  deps: IdentityProviderDeps,
): IdentityProvider {
  switch (config.provider) {
    case 'header':
      return createHeaderIdentityProvider(config)
    case 'passkey':
      return createPasskeyIdentityProvider(config, deps)
  }
}
