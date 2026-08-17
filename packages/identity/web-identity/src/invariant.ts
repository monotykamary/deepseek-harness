/**
 * Package-owned invariant companion for `@monotykamary/dsh-web-identity`.
 * @module @monotykamary/dsh-web-identity/invariant
 */

import type { Context } from '@monotykamary/cordis'
import type { InvariantInstaller } from '@monotykamary/dsh-invariants'

const PACKAGE_NAME = '@monotykamary/dsh-web-identity'

/** Cordis companion plugin name. */
export const name = 'web-identity-invariant'
/** Service required before the companion can register. */
export const inject = ['invariants']

/**
 * No runtime invariant: the owned relation is "the /auth routes were
 * registered", and the teardown stream fires `internal/plugin` before the
 * disposing fiber's effects run, so the legitimate owner still holds the
 * routes at notification time and any claim probe would false-positive on
 * every correct disposal. The route register/release symmetry is covered by
 * the package's real-composition HMR-safety test instead.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
