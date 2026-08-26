/**
 * Snapshot-only root route override proving children inherit the request that delegated them.
 * @module examples/acp-agent/tests/fixtures/parent-model-route-override
 */

import type { Context } from '@monotykamary/cordis'

export const name = 'parent-model-route-override'

/** Route only top-level Agent requests through the fixture's non-default replay model. */
export function apply(ctx: Context): void {
  ctx.on('agent/request', async ({ agent }, next) => {
    const config = await next()
    if ((agent.session.header.delegationDepth ?? 0) > 0) return config
    return { ...config, provider: 'deepseek-official', model: 'deepseek-v4-pro' }
  })
}
