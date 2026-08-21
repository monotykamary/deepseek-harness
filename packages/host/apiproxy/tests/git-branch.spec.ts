import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { gitBranchName } from '../src/git-branch.ts'

let root: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'dsh-git-branch-'))
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

/** Write a plausible .git directory with the given HEAD ref content. */
function makeRepoAt(dir: string, head: string): void {
  mkdirSync(join(dir, '.git'), { recursive: true })
  writeFileSync(join(dir, '.git', 'HEAD'), head)
}

describe('gitBranchName', () => {
  it('reads a named branch from the enclosing repository HEAD', () => {
    makeRepoAt(root, 'ref: refs/heads/main\n')
    expect(gitBranchName(root)).toBe('main')
  })

  it('walks up from a nested working directory', () => {
    makeRepoAt(root, 'ref: refs/heads/feature/x\n')
    const nested = join(root, 'src', 'deep')
    mkdirSync(nested, { recursive: true })
    expect(gitBranchName(nested)).toBe('feature/x')
  })

  it('returns undefined outside any repository', () => {
    mkdirSync(join(root, 'plain'), { recursive: true })
    expect(gitBranchName(join(root, 'plain'))).toBeUndefined()
  })

  it('returns undefined for a detached HEAD', () => {
    makeRepoAt(root, 'c0ffee0000000000000000000000000000000000\n')
    expect(gitBranchName(root)).toBeUndefined()
  })

  it('resolves a linked-worktree .git pointer through its own gitdir HEAD', () => {
    // Worktree layout: the repo owns refs in a common gitdir; the worktree
    // .git is a file pointing at its per-worktree gitdir holding its HEAD.
    mkdirSync(join(root, 'worktrees', 'wt'), { recursive: true })
    writeFileSync(join(root, 'worktrees', 'wt', 'HEAD'), 'ref: refs/heads/wt-branch\n')
    mkdirSync(join(root, 'wt'), { recursive: true })
    writeFileSync(join(root, 'wt', '.git'), 'gitdir: ' + root + '/worktrees/wt' + '\n')
    expect(gitBranchName(join(root, 'wt'))).toBe('wt-branch')
  })

  it('resolves an unborn repository HEAD', () => {
    makeRepoAt(root, 'ref: refs/heads/main\n')
    expect(gitBranchName(root)).toBe('main')
  })
})
