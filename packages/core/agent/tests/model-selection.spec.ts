import { describe, expect, it } from 'vitest'
import { Context } from '@monotykamary/cordis'
import { createScope } from '@monotykamary/dsh-scope'
import { SessionId } from '@monotykamary/dsh-session'
import SystemPrompt from '@monotykamary/dsh-system-prompt'
import AgentRegistry, {
  agentEvents,
  assembleContextFor,
  installModelSelection,
  resolveAgentModelSelection,
  type Agent,
  type ModelSelectionRef,
} from '../src/index.ts'
import { ReasoningEffortId, type LlmCallConfig } from '@monotykamary/dsh-llm'

let nextAgent = 0

async function scopedAgent(
  ctx: Context,
  session: Agent['session'],
  options: Agent['options'] = {},
): Promise<{ agent: Agent; agentCtx: Context; setStatus: (status: Agent['status']) => void }> {
  let status: Agent['status'] = 'idle'
  const agent = {
    id: SessionId(`model-selection-${++nextAgent}`),
    session,
    options,
    get status() { return status },
  } as unknown as Agent
  let agentCtx!: Context
  await ctx.plugin(Object.assign((inner: Context) => {
    const scope = createScope(inner, agent)
    agentCtx = scope.ctx.extend({ agent })
    Object.defineProperty(agent, 'ctx', { value: agentCtx })
  }, { inject: ['agents', 'systemPrompt'] }))
  return { agent, agentCtx, setStatus: (next) => { status = next } }
}

describe('installModelSelection()', () => {
  it('snapshots prompt variables and request routing together, then disposes both listeners', async () => {
    const ctx = new Context()
    await ctx.plugin(AgentRegistry)
    await ctx.plugin(SystemPrompt)
    const { agent, agentCtx } = await scopedAgent(
      ctx,
      { requestHeader: () => undefined } as unknown as Agent['session'],
    )
    const selection: ModelSelectionRef = { current: undefined, assembled: undefined }
    const dispose = installModelSelection(agentCtx, agent, selection)
    const seed: LlmCallConfig = { provider: 'seed', model: 'seed', temperature: 0.2 }
    const signal = new AbortController().signal

    expect((await ctx.systemPrompt.assemble(assembleContextFor(agent))).variables).toEqual({})
    await expect(agentEvents(ctx, agent).waterfall(
      'agent/request', { turn: 1, step: 0, signal }, () => Promise.resolve(seed),
    )).resolves.toBe(seed)

    selection.current = {
      provider: 'alpha',
      model: 'a1',
      reasoningEffort: ReasoningEffortId('high'),
    }
    expect((await ctx.systemPrompt.assemble(assembleContextFor(agent))).variables).toMatchObject({ provider: 'alpha', model: 'a1' })
    selection.current = { provider: 'beta', model: 'b1' }
    await expect(agentEvents(ctx, agent).waterfall(
      'agent/request', { turn: 1, step: 0, signal }, () => Promise.resolve(seed),
    )).resolves.toEqual({
      provider: 'alpha',
      model: 'a1',
      reasoningEffort: ReasoningEffortId('high'),
      temperature: 0.2,
    })

    expect((await ctx.systemPrompt.assemble(assembleContextFor(agent))).variables).toMatchObject({ provider: 'beta', model: 'b1' })
    const inherited: LlmCallConfig = {
      provider: 'alpha',
      model: 'a1',
      reasoningEffort: ReasoningEffortId('max'),
      temperature: 0.2,
    }
    await expect(agentEvents(ctx, agent).waterfall(
      'agent/request', { turn: 1, step: 1, signal }, () => Promise.resolve(inherited),
    )).resolves.toEqual({ provider: 'beta', model: 'b1', temperature: 0.2 })

    dispose()
    expect(ctx.agents.modelSelection(agent)).toBeUndefined()
    expect((await ctx.systemPrompt.assemble(assembleContextFor(agent))).variables).toEqual({})
    await expect(agentEvents(ctx, agent).waterfall(
      'agent/request', { turn: 2, step: 0, signal }, () => Promise.resolve(seed),
    )).resolves.toBe(seed)
    await ctx.fiber.dispose()
  })

  it('exposes the active assembled route while running and the live next route while idle', async () => {
    const ctx = new Context()
    await ctx.plugin(AgentRegistry)
    await ctx.plugin(SystemPrompt)
    const selection: ModelSelectionRef = {
      current: { provider: 'selected', model: 'selected-model' },
      assembled: undefined,
    }
    const { agent, agentCtx, setStatus } = await scopedAgent(
      ctx,
      {
        requestHeader: () => ({ config: { provider: 'logged', model: 'logged-model' } }),
      } as unknown as Agent['session'],
      { provider: 'static', model: 'static-model' },
    )
    installModelSelection(agentCtx, agent, selection)
    const source = ctx.agents.modelSelection(agent)
    const proxy = { id: agent.id, session: agent.session } as Agent
    expect(ctx.agents.modelSelection(proxy)).toBe(source)
    expect(() => ctx.agents.registerModelSelection(proxy, {
      current: () => undefined,
      assembled: () => undefined,
    })).toThrow(`a model selection source is already registered for agent ${String(agent.id)}`)

    expect(resolveAgentModelSelection(agent)).toEqual({ provider: 'selected', model: 'selected-model' })
    const detached = ctx.agents.modelSelection(agent)?.current()
    if (detached === undefined) throw new Error('expected a live selection')
    detached.model = 'mutated-copy'
    expect(ctx.agents.modelSelection(agent)?.current()?.model).toBe('selected-model')

    setStatus('running')
    await ctx.systemPrompt.assemble(assembleContextFor(agent))
    selection.current = { provider: 'future', model: 'future-model' }
    expect(resolveAgentModelSelection(agent)).toEqual({ provider: 'selected', model: 'selected-model' })

    setStatus('idle')
    agentEvents(ctx, agent).emit('agent/status', { status: 'idle' })
    expect(selection.assembled).toBeUndefined()
    expect(resolveAgentModelSelection(agent)).toEqual({ provider: 'future', model: 'future-model' })

    await ctx.fiber.dispose()
  })

  it('falls back through the durable request header and complete static options', async () => {
    const ctx = new Context()
    await ctx.plugin(AgentRegistry)
    let header: ReturnType<Agent['session']['requestHeader']> = {
      config: {
        provider: 'logged',
        model: 'logged-model',
        reasoningEffort: ReasoningEffortId('high'),
      },
    }
    const options: Agent['options'] = { provider: 'static', model: 'static-model' }
    const agent = {
      ctx,
      status: 'idle',
      options,
      session: { requestHeader: () => header },
    } as unknown as Agent

    expect(resolveAgentModelSelection(agent)).toEqual({
      provider: 'logged',
      model: 'logged-model',
      reasoningEffort: ReasoningEffortId('high'),
    })

    header = undefined
    expect(resolveAgentModelSelection(agent)).toEqual({ provider: 'static', model: 'static-model' })

    delete options.model
    expect(resolveAgentModelSelection(agent)).toBeUndefined()

    await ctx.fiber.dispose()
  })

  it('drops the selected effort when the route model cannot serve it, and keeps a served one', async () => {
    const ctx = new Context()
    await ctx.plugin(AgentRegistry)
    await ctx.plugin(SystemPrompt)
    let serve = false
    ctx.provide('llm', {
      async resolveCallConfig(config: { reasoningEffort?: string }) {
        if (serve) return config
        const error = new Error('model cannot serve reasoning effort ' + String(config.reasoningEffort)) as Error & { code?: string }
        error.code = 'UNSUPPORTED_REASONING_EFFORT'
        throw error
      },
    })
    const selection: ModelSelectionRef = { current: undefined, assembled: undefined }
    const { agent, agentCtx } = await scopedAgent(ctx, { requestHeader: () => undefined } as unknown as Agent['session'])
    const dispose = installModelSelection(agentCtx, agent, selection)
    const seed: LlmCallConfig = { provider: 'seed', model: 'seed', temperature: 0.2 }
    const signal = new AbortController().signal

    selection.current = {
      provider: 'alpha',
      model: 'a1',
      reasoningEffort: ReasoningEffortId('high'),
    }
    await ctx.systemPrompt.assemble(assembleContextFor(agent))
    await expect(agentEvents(ctx, agent).waterfall(
      'agent/request', { turn: 1, step: 0, signal }, () => Promise.resolve(seed),
    )).resolves.toStrictEqual({
      provider: 'alpha',
      model: 'a1',
      temperature: 0.2,
    })

    serve = true
    await expect(agentEvents(ctx, agent).waterfall(
      'agent/request', { turn: 1, step: 1, signal }, () => Promise.resolve(seed),
    )).resolves.toEqual({
      provider: 'alpha',
      model: 'a1',
      reasoningEffort: ReasoningEffortId('high'),
      temperature: 0.2,
    })

    dispose()
    await ctx.fiber.dispose()
  })

})
