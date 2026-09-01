/**
 * Shared path resolution and regular-file validation for model-facing read tools.
 * @module @monotykamary/dsh-tool-fs/src/read-target
 */

import type { Context } from '@monotykamary/cordis'
import { FsError } from '@monotykamary/dsh-fs'
import type { FsInfo, FsTarget } from '@monotykamary/dsh-fs'
import type { ToolExecution } from '@monotykamary/dsh-tools'
import { sessionResolveOptions } from './session-cwd.ts'

/**
 * Resolve a model-supplied path, observe absence, and require a regular file.
 * @param ctx - the plugin context providing filesystem resolution and observation events.
 * @param exec - the current tool execution, including session cwd and cancellation.
 * @param requestedPath - the raw path supplied to the tool.
 * @param observationExec - the natural execution that owns an optional absent observation.
 * @returns the resolved target and its single stat result.
 */
export async function resolveRegularReadTarget(
  ctx: Context,
  exec: Pick<ToolExecution, 'agent' | 'signal'>,
  requestedPath: string,
  observationExec?: ToolExecution,
): Promise<{ target: FsTarget; info: FsInfo }> {
  const target = await ctx.fs.resolve(requestedPath, sessionResolveOptions(exec, requestedPath))
  const info = await ctx.fs.stat(target, exec.signal)
  if (info === undefined) {
    if (observationExec !== undefined) ctx.emit('fs/observed', target, { kind: 'absent' }, observationExec)
    throw new FsError(`cannot read "${target.displayPath}": not found`, 'FS_NOT_FOUND')
  }
  if (info.type !== 'file') {
    throw new FsError(`cannot read "${target.displayPath}": not a regular file`, 'FS_NOT_REGULAR_FILE')
  }
  return { target, info }
}
