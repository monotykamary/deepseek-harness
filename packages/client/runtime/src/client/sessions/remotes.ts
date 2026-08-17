/**
 * Remote namespaces the Session cluster calls. One parameter for one concept:
 * the generated surface a Session and its manager reach the Host through.
 *
 * @module @monotykamary/dsh-client-runtime/client/sessions/remotes
 */

import type { Context } from '@monotykamary/cordis'
import type {} from '@monotykamary/dsh-api-remotes/client'

/** The generated Remote namespaces a Session and its manager call. */
export type SessionRemotes = Pick<Context['remote'], 'commands'>
