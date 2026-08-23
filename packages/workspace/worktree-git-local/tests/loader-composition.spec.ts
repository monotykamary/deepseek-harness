/** Real Loader composition for the shipped Worktree Service and local Git provider. */
import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@monotykamary/cordis'
import Include from '@monotykamary/cordis-plugin-include'
import Loader from '@monotykamary/cordis-plugin-loader'
import AgentRegistry from '@monotykamary/dsh-agent'
import LocalSubprocessRuntime from '@monotykamary/dsh-subprocess-local'
import WorktreeRegistry from '@monotykamary/dsh-worktree'
import * as LocalGitWorktree from '../src/index.ts'

let root: string | undefined
let ctx: Context | undefined

afterEach(async () => {
  await ctx?.fiber.dispose()
  ctx = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

function git(cwd: string, ...args: string[]): void {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Loader Test',
      GIT_AUTHOR_EMAIL: 'loader@example.test',
      GIT_COMMITTER_NAME: 'Loader Test',
      GIT_COMMITTER_EMAIL: 'loader@example.test',
    },
  })
  if (result.status !== 0) throw new Error(result.stderr || result.stdout)
}

async function boot(): Promise<{ context: Context; repo: string }> {
  root = await mkdtemp(join(tmpdir(), 'dsh-worktree-loader-'))
  const repo = join(root, 'repo')
  const managed = join(root, 'managed')
  await mkdir(repo)
  await mkdir(managed)
  git(repo, 'init', '-b', 'main')
  await writeFile(join(repo, 'README.md'), 'fixture\n')
  git(repo, 'add', 'README.md')
  git(repo, 'commit', '-m', 'base')
  const configPath = join(root, 'cordis.yml')
  await writeFile(configPath, [
    "- name: '@monotykamary/dsh-agent'",
    "- name: '@monotykamary/dsh-subprocess-local'",
    "- name: '@monotykamary/dsh-worktree'",
    '  config:',
    '    provider: git-local',
    "- name: '@monotykamary/dsh-worktree-git-local'",
    '  config:',
    `    root: ${JSON.stringify(managed)}`,
    '',
  ].join('\n'))

  ctx = new Context()
  ctx.baseUrl = pathToFileURL(root).href + '/'
  await ctx.plugin(Loader)
  ctx.loader.builtins.include = Include
  const modules = new Map<string, unknown>([
    ['@monotykamary/dsh-agent', AgentRegistry],
    ['@monotykamary/dsh-subprocess-local', LocalSubprocessRuntime],
    ['@monotykamary/dsh-worktree', WorktreeRegistry],
    ['@monotykamary/dsh-worktree-git-local', LocalGitWorktree],
  ])
  ctx.loader.internal = {
    version: 'v2',
    async import(specifier: string) {
      const module = modules.get(specifier)
      if (module === undefined) throw new Error(`unexpected Loader import: ${specifier}`)
      return module
    },
  } as unknown as NonNullable<typeof ctx.loader.internal>
  await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(configPath).href } })
  await ctx.loader.await()
  return { context: ctx, repo }
}

describe('real Loader composition', () => {
  it('serves Git repository facts and removes the provider on HMR disposal', async () => {
    const { context, repo } = await boot()
    const worktrees = context.get('worktrees') as WorktreeRegistry
    expect(worktrees.listProviders()).toEqual(['git-local'])
    await expect(worktrees.locate({ cwd: repo })).resolves.toMatchObject({ name: 'repo', provider: 'git-local' })
    await expect(worktrees.list({ cwd: repo })).resolves.toEqual([
      expect.objectContaining({ kind: 'main', current: true, managed: false }),
    ])

    const provider = [...context.loader.entries()]
      .find(entry => entry.options.name === '@monotykamary/dsh-worktree-git-local')
    if (provider?.fiber === undefined) throw new Error('provider entry did not activate')
    await provider.fiber.dispose()
    expect(worktrees.listProviders()).toEqual([])
  })
})
