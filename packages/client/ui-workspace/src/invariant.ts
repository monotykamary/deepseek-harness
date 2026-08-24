/**
 * Package-owned invariant companion for `@monotykamary/dsh-client-ui-workspace`.
 * @module @monotykamary/dsh-client-ui-workspace/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@monotykamary/cordis'
import type { InvariantInstaller } from '@monotykamary/dsh-invariants'

const PACKAGE_NAME = '@monotykamary/dsh-client-ui-workspace'

/** Cordis companion plugin name. */
export const name = 'client-ui-workspace-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the Host contribution is a schema-validated settings
 * namespace whose registration/update relations are owned by dsh-settings. The
 * `sessionDisposition` provider and its Session-list relationship exist only in
 * the browser Cordis tree; this Host companion has no authoritative client event
 * stream to inspect without adding a diagnostic wire surface.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
