/**
 * Current-branch support for the Session card's git-branch label.
 *
 * Resolves the checked-out branch of the repository enclosing a Session's
 * working directory by reading git metadata directly — no `git` subprocess,
 * no index access, no hooks. Mirrors portable .git discovery: walk up the
 * directory tree, accept the plain .git directory or the worktree/submodule
 * .git file whose first line is `gitdir: <path>`, then read HEAD from the
 * resolved gitdir. Linked worktrees own a per-worktree HEAD (the common dir
 * holds only shared object refs), so reading the gitdir's own HEAD is correct
 * for detached and unborn states alike. A detached HEAD or a directory that
 * is outside any repository yields undefined, and the card simply omits the
 * label.
 *
 * This is a pure function of filesystem state at call time; the caller owns
 * caching if repeated probes are hot. The name matches
 * `git branch --show-current` for ordinary branches; a detached HEAD,
 * bare repository, or non-repository returns undefined.
 * @param startDir - absolute directory of the session working tree.
 * @returns the current branch name, or undefined when not discoverable.
 */

import { readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

/** First non-comment line of a worktree/submodule .git pointer file. */
const GITDIR_POINTER = /^gitdir:\s*(.+)$/m

/** Read one file's text, tolerating anything that is not a readable file. */
function tryRead(path: string): string | undefined {
  try {
    const text = readFileSync(path, 'utf8')
    return text === '' ? undefined : text
  } catch {
    return undefined
  }
}

/**
 * Resolve the gitdir for a directory that contains a .git entry: the entry
 * itself when it is a directory, or the target a "gitdir: <path>" pointer
 * file names (worktree/submodule; paths resolve against the entry's
 * directory, like git does).
 * @param cwd - directory already known to contain .git.
 * @returns the actual gitdir, or undefined for a malformed pointer.
 */
function gitDirFor(cwd: string): string | undefined {
  const entry = join(cwd, '.git')
  let stat: ReturnType<typeof statSync>
  try {
    stat = statSync(entry)
  } catch {
    return undefined
  }
  if (stat.isDirectory()) return entry
  if (!stat.isFile()) return undefined
  const pointer = GITDIR_POINTER.exec(tryRead(entry) ?? '')?.[1]
  return pointer === undefined ? undefined : resolve(cwd, pointer.trim())
}

/**
 * Walk up from `startDir` until a .git entry exists (or the filesystem root
 * ends the walk), then read the enclosing repository's HEAD symref.
 * @param startDir - absolute directory of the session working tree.
 * @returns the checked-out branch label, or undefined when not discoverable.
 */
export function gitBranchName(startDir: string): string | undefined {
  // A missing directory cannot hold a repository; skip the upward walk (a
  // synthetic/historical cwd costs one stat, not a climb to the filesystem
  // root per row).
  try {
    if (!statSync(startDir).isDirectory()) return undefined
  } catch {
    return undefined
  }
  let current = resolve(startDir)
  for (;;) {
    try {
      statSync(join(current, '.git'))
    } catch {
      const parent = dirname(current)
      if (parent === current) return undefined
      current = parent
      continue
    }
    const gitDir = gitDirFor(current)
    if (gitDir === undefined) return undefined
    const head = tryRead(join(gitDir, 'HEAD'))
    const branch = head === undefined
      ? undefined
      : /^ref:\s*refs\/heads\/(\S+)$/m.exec(head)?.[1]
    return branch === undefined ? undefined : branch.trim()
  }
}
