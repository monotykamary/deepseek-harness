/**
 * Derive the working directory a filesystem tool resolves relative paths against: the calling
 * agent's per-session workspace (`exec.agent.session.header.cwd`), so each session's
 * `read`/`write`/`edit` act on ITS workspace, not the server's launch dir — mirroring how
 * `dsh-tool-bash` defaults a bash `workdir` to the session cwd.
 * Non-agent calls return `undefined`, leaving the fallback in the provider rather than reading
 * `process.cwd()` at the tool boundary.
 * @module @monotykamary/dsh-tool-fs/session-cwd
 */

import { isAbsolute, relative, resolve, sep } from 'node:path'
import type { ToolExecution } from '@monotykamary/dsh-tools'
import { canonicalPath } from '@monotykamary/dsh-sandbox'

const PARENT_PATH_SEGMENT = /(?:^|[\\/])\.\.(?:[\\/]|$)/

/**
 * The session workspace cwd for this call, or `undefined` when none applies.
 * @param exec - the tool-execution context; only its optional `agent` is read.
 * @param requestedPath - the path the provider will resolve; parent traversal
 *   makes a symlinked cwd's filesystem identity observable.
 * @returns the calling agent's session cwd, or undefined for a non-agent caller (the backend then applies its own default).
 */
export function sessionCwd(exec: Pick<ToolExecution, 'agent'>, requestedPath: string): string | undefined {
  const cwd = exec.agent?.session.header.cwd
  if (cwd === undefined || (!PARENT_PATH_SEGMENT.test(cwd) && !PARENT_PATH_SEGMENT.test(requestedPath))) return cwd
  return canonicalPath(cwd)
}

/**
 * Resolution options shared by all model-facing filesystem tools.
 * @param exec - the tool-execution context supplying session cwd and cancellation.
 * @param requestedPath - the path the provider will resolve.
 * @param policyWorkspaceRoot - resolved per-call root, when a mutation carries sandbox policy.
 * @returns provider resolution options for the current tool call.
 */
export function sessionResolveOptions(
  exec: Pick<ToolExecution, 'agent' | 'signal'>,
  requestedPath: string,
  policyWorkspaceRoot?: string,
): { cwd?: string; signal?: AbortSignal } {
  const cwd = policyWorkspaceRoot ?? sessionCwd(exec, requestedPath)
  return {
    ...cwd !== undefined ? { cwd } : {},
    signal: exec.signal,
  }
}

/**
 * Check whether hidden read acquisition is confined to the caller's canonical workspace.
 * @param exec - the calling execution whose session supplies the workspace root.
 * @param requestedPath - the model-supplied path resolved under that root.
 * @returns whether the canonical target remains contained and is not a URI.
 */
export function isSpeculationReadContained(
  exec: Pick<ToolExecution, 'agent'>,
  requestedPath: string,
): boolean {
  if (/^[A-Za-z][A-Za-z\d+.-]*:/u.test(requestedPath)) return false
  const workdir = exec.agent?.session.header.cwd ?? process.cwd()
  const workspace = canonicalPath(resolve(workdir))
  const target = canonicalPath(resolve(workdir, requestedPath))
  const rel = relative(workspace, target)
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))
}
