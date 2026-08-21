/**
 * The session.list column resolves the checked-out branch of the
 * session's working tree on the host: a repository-backed cwd reports its
 * HEAD ref, a plain directory reports none (no branch, no error).
 */

import { describe, expect, it } from 'vitest'
import { Context } from '@monotykamary/cordis'
import AgentRegistry from '@monotykamary/dsh-agent'
import SessionStore from '@monotykamary/dsh-session'
import UserQuestionService from '@monotykamary/dsh-user-questions'
import type { ApiProxy, RpcRequest } from '@monotykamary/dsh-host-apiproxy/api'
import { RpcId } from '@monotykamary/dsh-host-apiproxy/api/rpc'
import { createApiProxy } from '@monotykamary/dsh-host-apiproxy'
import { mkdirSync, mkdtempSync, writeFileSync, rmSync, realpathSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

let nextRpc = 1
function request<P>(payload: P): RpcRequest<P> {
  return { rpcId: RpcId('branch-' + String(nextRpc++)), payload }
}

/** A working tree whose .git directory carries the given HEAD ref content. */
function repoAt(dir: string, branch: string): void {
  mkdirSync(join(dir, '.git'), { recursive: true })
  writeFileSync(join(dir, '.git', 'HEAD'), 'ref: refs/heads/' + branch + '\n')
}

async function harness(): Promise<{ ctx: Context; api: ApiProxy }> {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(UserQuestionService)
  await ctx.plugin(AgentRegistry)
  const api = createApiProxy(ctx, { defaultModelSelection: () => ({ provider: 'p', model: 'm' }), cwd: '/tmp' })
  return { ctx, api }
}

describe('session listing git branch column', () => {
  it('reports the enclosing branch for a repository cwd and omits it elsewhere', async () => {
    const { ctx, api } = await harness()
    const repo = realpathSync(mkdtempSync(join(tmpdir(), 'dsh-branch-repo-')))
    const plain = realpathSync(mkdtempSync(join(tmpdir(), 'dsh-branch-plain-')))
    try {
      repoAt(repo, 'feature/x')
      const repoSession = ctx.sessions.create(undefined, { meta: { cwd: repo } })
      const plainSession = ctx.sessions.create(undefined, { meta: { cwd: plain } })
      const response = await api.sessions.list(request({}))
      if (!response.result.ok) throw new Error('list failed')
      const byId = new Map(response.result.value.items.map(s => [s.sessionId, s]))
      expect(byId.get(repoSession.id)).toMatchObject({ cwd: repo, branch: 'feature/x' })
      expect(byId.get(plainSession.id)).toMatchObject({ cwd: plain })
      expect(byId.get(plainSession.id)?.branch).toBeUndefined()
    } finally {
      rmSync(repo, { recursive: true, force: true })
      rmSync(plain, { recursive: true, force: true })
    }
  })
})
