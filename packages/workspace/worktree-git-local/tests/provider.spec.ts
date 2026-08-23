import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@monotykamary/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AgentRegistry from '@monotykamary/dsh-agent'
import SessionStore, { SessionId } from '@monotykamary/dsh-session'
import LocalSubprocessRuntime from '@monotykamary/dsh-subprocess-local'
import WorktreeRegistry, { WorktreeCheckoutId } from '@monotykamary/dsh-worktree'
import {
  Config as ProviderConfig,
  LocalGitWorktreeProvider,
  WorktreeGitError,
  apply,
  inject,
  parseWorktreePorcelain,
} from '../src/index.ts'

const roots: string[] = []

function git(cwd: string, ...args: string[]): string {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Factory Test',
      GIT_AUTHOR_EMAIL: 'factory@example.test',
      GIT_COMMITTER_NAME: 'Factory Test',
      GIT_COMMITTER_EMAIL: 'factory@example.test',
      GIT_PAGER: '',
      GIT_TERMINAL_PROMPT: '0',
    },
  })
  if (result.status !== 0) throw new Error(result.stderr || result.stdout)
  return result.stdout.trim()
}

async function fixture(overrides: Record<string, unknown> = {}) {
  const root = await mkdtemp(join(tmpdir(), 'dsh-worktree-'))
  roots.push(root)
  const repo = join(root, 'repo')
  const managed = join(root, 'managed')
  mkdirSync(repo)
  mkdirSync(managed)
  git(repo, 'init', '-b', 'main')
  writeFileSync(join(repo, '.gitignore'), '.env\nsecrets/\n')
  writeFileSync(join(repo, '.worktreeinclude'), '.env\nsecrets/token.txt\ntracked.txt\n')
  writeFileSync(join(repo, '.env'), 'TOKEN=fixture\n')
  mkdirSync(join(repo, 'secrets'))
  writeFileSync(join(repo, 'secrets/token.txt'), 'fixture\n')
  writeFileSync(join(repo, 'tracked.txt'), 'tracked\n')
  git(repo, 'add', '.gitignore', '.worktreeinclude', 'tracked.txt')
  git(repo, 'commit', '-m', 'base')

  const ctx = new Context()
  const fibers = [
    await ctx.plugin(SessionStore),
    await ctx.plugin(AgentRegistry),
    await ctx.plugin(LocalSubprocessRuntime),
    await ctx.plugin(WorktreeRegistry, { provider: 'git-local' }),
  ]
  fibers.push(await ctx.plugin({ name: 'fixture-provider', inject, apply }, {
    root: managed,
    commandTimeoutMs: 10_000,
    outputMaxBytes: 1_048_576,
    terminationGraceMs: 100,
    fetchFreshBase: false,
    includeFileMaxBytes: 65_536,
    includeMaxPatterns: 16,
    includeMaxFiles: 16,
    includeMaxTotalBytes: 65_536,
    ...overrides,
  }))
  const worktrees = ctx.get('worktrees') as WorktreeRegistry
  const agents = ctx.get('agents') as AgentRegistry
  const sessions = ctx.get('sessions') as SessionStore
  const dispose = async (): Promise<void> => {
    for (const fiber of fibers.reverse()) await fiber.dispose()
  }
  return { ctx, root, repo, managed, worktrees, agents, sessions, dispose }
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('parseWorktreePorcelain', () => {
  it('parses branch, detached, locked, prunable, and unknown fields', () => {
    expect(parseWorktreePorcelain([
      'worktree /repo', 'HEAD abc', 'branch refs/heads/main', 'future value', '',
      'worktree /linked', 'HEAD def', 'detached', 'locked reason', 'prunable reason', '',
    ].join('\n'))).toEqual([
      { path: '/repo', head: 'abc', branch: 'main', detached: false, locked: false, prunable: false },
      { path: '/linked', head: 'def', branch: null, detached: true, locked: true, prunable: true },
    ])
  })
})

describe('LocalGitWorktreeProvider', () => {
  it('rejects include filenames that can escape the repository root', () => {
    expect(() => ProviderConfig({ root: '/tmp/worktrees', includeFilename: '../outside' })).toThrow()
    expect(() => ProviderConfig({ root: '/tmp/worktrees', includeFilename: '..' })).toThrow()
    expect(ProviderConfig({ root: '/tmp/worktrees', includeFilename: '.worktreeinclude' }).includeFilename)
      .toBe('.worktreeinclude')
  })

  it('locates one repository from main and linked checkouts and copies only allowlisted ignored files', async () => {
    const { repo, worktrees, dispose } = await fixture()
    const main = await worktrees.locate({ cwd: repo })
    expect(main).toMatchObject({ provider: 'git-local', name: 'repo', mainPath: realpathSync(repo) })
    const created = await worktrees.create({
      cwd: repo,
      checkoutId: WorktreeCheckoutId('task-a'),
      label: 'Implement API',
      baseRef: 'head',
    })
    expect(created).toMatchObject({ id: 'task-a', kind: 'linked', managed: true, current: false })
    expect(created.branch).toMatch(/^dsh\/Implement-API-/)
    expect(created.copiedFiles).toEqual(['.env', 'secrets/token.txt'])
    expect(readFileSync(join(created.path, '.env'), 'utf8')).toBe('TOKEN=fixture\n')
    expect(existsSync(join(created.path, 'tracked.txt'))).toBe(true)
    const fromLinked = await worktrees.locate({ cwd: created.path })
    expect(fromLinked?.id).toBe(main?.id)
    expect((await worktrees.list({ cwd: created.path })).filter(item => item.kind === 'linked')).toHaveLength(1)
    await dispose()
  })

  it('is idempotent for an existing managed target and rejects an invalid explicit base', async () => {
    const { repo, worktrees, dispose } = await fixture()
    const request = {
      cwd: repo,
      checkoutId: WorktreeCheckoutId('same'),
      label: 'Same',
      baseRef: 'head' as const,
    }
    const first = await worktrees.create(request)
    const second = await worktrees.create(request)
    expect(second.path).toBe(first.path)
    await expect(worktrees.create({
      cwd: repo,
      checkoutId: WorktreeCheckoutId('bad-ref'),
      label: 'Bad ref',
      baseRef: { ref: 'refs/heads/does-not-exist' },
    })).rejects.toMatchObject({ code: 'git-failed' })
    await dispose()
  })

  it('guards main, external, dirty, and active-session worktrees before clean removal', async () => {
    const { ctx, root, repo, worktrees, agents, sessions, dispose } = await fixture()
    const created = await worktrees.create({
      cwd: repo, checkoutId: WorktreeCheckoutId('guarded'), label: 'Guarded', baseRef: 'head',
    })
    const main = (await worktrees.list({ cwd: repo })).find(item => item.kind === 'main')
    await expect(worktrees.remove({ cwd: repo, path: main?.path ?? repo }))
      .rejects.toMatchObject({ code: 'protected' })

    const external = join(root, 'external')
    git(repo, 'worktree', 'add', '-b', 'external-branch', external)
    await expect(worktrees.remove({ cwd: repo, path: external }))
      .rejects.toMatchObject({ code: 'unsafe-path' })

    writeFileSync(join(created.path, 'dirty.txt'), 'dirty\n')
    await expect(worktrees.remove({ cwd: repo, path: created.path }))
      .rejects.toMatchObject({ code: 'dirty' })
    rmSync(join(created.path, 'dirty.txt'))

    const session = sessions.create(SessionId('active-worktree'), { meta: { cwd: created.path } })
    const active = { id: session.id, session, status: 'idle', ctx } as never
    const list = vi.spyOn(agents, 'list').mockReturnValue([active])
    await expect(worktrees.remove({ cwd: repo, path: created.path }))
      .rejects.toMatchObject({ code: 'busy' })
    list.mockReturnValue([])
    await expect(worktrees.remove({ cwd: repo, path: created.path })).resolves.toMatchObject({ path: created.path })
    expect(existsSync(created.path)).toBe(false)
    await dispose()
  })

  it('sweeps only old, clean, unoccupied managed worktrees and retains their branches', async () => {
    const { repo, worktrees, dispose } = await fixture()
    const old = await worktrees.create({
      cwd: repo, checkoutId: WorktreeCheckoutId('old'), label: 'Old', baseRef: 'head',
    })
    const dirty = await worktrees.create({
      cwd: repo, checkoutId: WorktreeCheckoutId('dirty'), label: 'Dirty', baseRef: 'head',
    })
    writeFileSync(join(dirty.path, 'keep.txt'), 'keep\n')
    const past = new Date(0)
    utimesSync(old.path, past, past)
    utimesSync(dirty.path, past, past)

    const result = await worktrees.sweep({ cwd: repo, olderThanMs: 1_000, limit: 1, now: Date.now() })
    expect(result.removed.map(item => item.path)).toEqual([old.path])
    expect(existsSync(old.path)).toBe(false)
    expect(existsSync(dirty.path)).toBe(true)
    expect(git(repo, 'show-ref', '--verify', `refs/heads/${old.branch ?? ''}`)).not.toBe('')
    await dispose()
  })

  it('returns undefined outside Git and validates local configuration and sweep bounds', async () => {
    const { ctx, root, repo, managed, worktrees, dispose } = await fixture()
    const outside = join(root, 'outside')
    mkdirSync(outside)
    await expect(worktrees.locate({ cwd: outside })).resolves.toBeUndefined()
    await expect(worktrees.list({ cwd: outside })).rejects.toMatchObject({ code: 'not-repository' })
    await expect(worktrees.sweep({ cwd: repo, olderThanMs: -1, limit: 1 })).rejects.toBeInstanceOf(RangeError)
    await expect(worktrees.sweep({ cwd: repo, olderThanMs: 1, limit: -1 })).rejects.toBeInstanceOf(RangeError)
    expect(() => new LocalGitWorktreeProvider(ctx, { root: 'relative' })).toThrow(/root must be absolute/)
    expect(() => new LocalGitWorktreeProvider(ctx, { root: managed })).not.toThrow()
    await dispose()
  })

  it('skips symlinks and bounded include-file overflows without failing creation', async () => {
    const { repo, worktrees, dispose } = await fixture({ includeMaxFiles: 1, includeMaxTotalBytes: 1 })
    symlinkSync(join(repo, '.env'), join(repo, 'secrets', 'linked.env'))
    writeFileSync(join(repo, '.worktreeinclude'), 'secrets/linked.env\n.env\n')
    const created = await worktrees.create({
      cwd: repo, checkoutId: WorktreeCheckoutId('small'), label: 'Small', baseRef: 'fresh',
    })
    expect(created.copiedFiles).toEqual([])
    await dispose()
  })

  it('surfaces typed Git command errors', () => {
    const error = new WorktreeGitError('git-failed', 'failed', { cause: new Error('cause') })
    expect(error).toMatchObject({ name: 'WorktreeGitError', code: 'git-failed', message: 'failed' })
    expect(error.cause).toBeInstanceOf(Error)
  })
})
