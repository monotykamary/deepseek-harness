/** Package-owned invariant companion. @module @monotykamary/dsh-distribution-update/invariant */

import type { Context } from '@monotykamary/cordis'
import type { InvariantInstaller } from '@monotykamary/dsh-invariants'

const PACKAGE_NAME = '@monotykamary/dsh-distribution-update'
export const name = 'distribution-update-invariant'
export const inject = ['invariants']

/** No runtime invariant: registry state has no authoritative in-process companion. */
const install: InvariantInstaller = () => {}

/** Register this package's invariant companion. */
export const apply = (ctx: Context): Promise<() => void> => Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
