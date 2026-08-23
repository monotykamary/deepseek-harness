import { Context } from '@monotykamary/cordis'
import { describe, expect, it, vi } from 'vitest'
import WorktreeRegistry, {
  WorktreeCheckoutId,
  WorktreeRepositoryId,
  type ResolvedWorktreeRequest,
  type WorktreeCreateRequest,
  type WorktreeLocateRequest,
  type WorktreeProvider,
} from '../src/index.ts'
import * as invariant from '../src/invariant.ts'

interface FixtureProvider extends WorktreeProvider {
  readonly createRequests: ResolvedWorktreeRequest<WorktreeCreateRequest>[]
}

function provider(name = 'fixture'): FixtureProvider {
  const createRequests: ResolvedWorktreeRequest<WorktreeCreateRequest>[] = []
  return {
    name,
    createRequests,
    locate: async request => ({
      id: WorktreeRepositoryId('repo'), provider: request.provider, name: 'repo', mainPath: request.cwd,
    }),
    list: async () => [],
    create: async (request) => {
      createRequests.push(request)
      return {
        id: request.checkoutId as ReturnType<typeof WorktreeCheckoutId>,
        repositoryId: WorktreeRepositoryId('repo'), path: '/work/linked', branch: 'branch', head: 'abc',
        kind: 'linked', managed: true, current: false, locked: false, prunable: false,
        activeSessionIds: [],
      }
    },
    remove: async request => ({
      id: WorktreeCheckoutId('linked'), repositoryId: WorktreeRepositoryId('repo'), path: request.path,
      branch: 'branch', head: 'abc', kind: 'linked', managed: true, current: false, locked: false,
      prunable: false, activeSessionIds: [],
    }),
    sweep: async () => ({ removed: [] }),
  }
}

async function harness(defaultProvider = 'fixture') {
  const ctx = new Context()
  const fiber = await ctx.plugin(WorktreeRegistry, { provider: defaultProvider })
  const worktrees = ctx.get('worktrees') as WorktreeRegistry
  return { ctx, fiber, worktrees }
}

describe('WorktreeRegistry', () => {
  it('resolves the configured provider and delegates every operation', async () => {
    const { fiber, worktrees } = await harness()
    const implementation = provider()
    worktrees.registerProvider(implementation)

    expect(worktrees.resolve<WorktreeLocateRequest>({ cwd: '/work' })).toEqual({ cwd: '/work', provider: 'fixture' })
    await expect(worktrees.locate({ cwd: '/work' })).resolves.toMatchObject({ provider: 'fixture' })
    await expect(worktrees.list({ cwd: '/work' })).resolves.toEqual([])
    const created = await worktrees.create({ cwd: '/work', label: 'task', baseRef: 'head' })
    expect(String(created.id)).not.toBe('')
    await expect(worktrees.remove({ cwd: '/work', path: '/work/linked' })).resolves.toMatchObject({
      path: '/work/linked',
    })
    await expect(worktrees.sweep({ cwd: '/work', olderThanMs: 1, limit: 1 })).resolves.toEqual({ removed: [] })
    expect(implementation.createRequests).toEqual([expect.objectContaining({ provider: 'fixture' })])
    await fiber.dispose()
  })

  it('honors an explicit provider and caller-owned checkout identity', async () => {
    const { fiber, worktrees } = await harness('first')
    const first = provider('first')
    const second = provider('second')
    worktrees.registerProvider(first)
    worktrees.registerProvider(second)
    const id = WorktreeCheckoutId('chosen')

    await worktrees.create({ provider: 'second', cwd: '/work', checkoutId: id, label: 'task', baseRef: 'head' })
    expect(first.createRequests).toEqual([])
    expect(second.createRequests).toEqual([expect.objectContaining({ provider: 'second', checkoutId: id })])
    await fiber.dispose()
  })

  it('fails loud for missing and duplicate providers and removes an exact registration', async () => {
    const { ctx, fiber, worktrees } = await harness('missing')
    expect(() => worktrees.list({ cwd: '/work' })).toThrow(/not registered/)
    const changes: string[] = []
    ctx.on('worktrees/provider-change', (change) => { changes.push(`${change.provider}:${String(change.present)}`) })
    const first = provider('same')
    const dispose = worktrees.registerProvider(first)
    expect(worktrees.listProviders()).toEqual(['same'])
    expect(() => worktrees.registerProvider(provider('same'))).toThrow(/already registered/)
    dispose()
    dispose()
    expect(worktrees.listProviders()).toEqual([])
    expect(changes).toEqual(['same:true', 'same:false'])
    await fiber.dispose()
  })
})

describe('worktree invariant', () => {
  it('registers the provider-change relation under the manifest name', async () => {
    const register = vi.fn().mockReturnValue(() => {})
    await invariant.apply({ invariants: { register } } as never)
    expect(register).toHaveBeenCalledWith('@monotykamary/dsh-worktree', expect.any(Function))
  })
})
