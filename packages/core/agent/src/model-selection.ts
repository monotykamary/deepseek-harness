/**
 * Agent-scoped model selection shared by runtime entry points.
 * @module @monotykamary/dsh-agent/model-selection
 */

import type { Context } from '@monotykamary/cordis'
import type { LlmCallConfig, ReasoningEffortId } from '@monotykamary/dsh-llm'
import type { Agent } from './runtime-types.ts'

/** Complete provider, model, and optional reasoning effort selected for one live Agent. */
export interface ModelSelection {
  /** Registered provider route. */
  provider: string
  /** Provider-owned model id. */
  model: string
  /** Adapter-owned reasoning effort, or provider/default behavior when absent. */
  reasoningEffort?: ReasoningEffortId
}

/** Mutable model selection plus the value captured for the current step. */
export interface ModelSelectionRef {
  /** Model selected for the next step that enters prompt assembly. */
  current: ModelSelection | undefined
  /** Selection captured when the current step entered prompt assembly. */
  assembled: ModelSelection | undefined
}

/** Agent-scoped source for the live next-step and active-step model selections. */
export interface AgentModelSelection {
  /**
   * Read the selection the next prompt assembly will consume.
   * @returns a detached selection, or undefined when the entry point declares none.
   */
  current(): ModelSelection | undefined
  /**
   * Read the selection captured for the active assembled step.
   * @returns a detached selection, or undefined outside an assembled step.
   */
  assembled(): ModelSelection | undefined
}

/**
 * Resolve the route an Agent is using now, or will use for its next step while idle.
 * The active assembled selection wins during a running step; otherwise the live
 * next-step selection wins, followed by the latest durable request header and
 * complete static Agent options.
 * @param agent - Agent whose effective model selection is requested.
 * @returns a detached complete selection, or undefined before any complete route exists.
 */
export function resolveAgentModelSelection(agent: Agent): ModelSelection | undefined {
  const source = agent.ctx.agents.modelSelection(agent)
  const selected = agent.status === 'running'
    ? source?.assembled() ?? source?.current()
    : source?.current()
  if (selected !== undefined) return { ...selected }

  const logged = agent.session.requestHeader()?.config
  if (logged !== undefined) {
    return {
      provider: logged.provider,
      model: logged.model,
      ...logged.reasoningEffort === undefined ? {} : { reasoningEffort: logged.reasoningEffort },
    }
  }

  if (agent.options.provider === undefined || agent.options.model === undefined) return undefined
  return { provider: agent.options.provider, model: agent.options.model }
}

/**
 * Couple one mutable selection to Agent-scoped prompt assembly, request routing,
 * and effective-route lookup by in-process child creation. Prompt assembly
 * snapshots the selected model before delegating, then applies its provider/model
 * pair and effort to request config so a concurrent switch takes effect on a
 * later step instead of giving prompt variables and request routing different
 * selections. An absent selected effort clears any inherited effort, restoring
 * the selected model's provider/default behavior.
 *
 * @param agentCtx - The selected Agent's scoped context.
 * @param agent - Exact Agent that owns the selection.
 * @param selection - Mutable selection owned by the calling entry point.
 * @returns disposer for the scoped source, status reset, and both waterfall listeners.
 * @throws when that Agent already has a source.
 */
export function installModelSelection(
  agentCtx: Context,
  agent: Agent,
  selection: ModelSelectionRef,
): () => void {
  const snapshot = (value: ModelSelection | undefined): ModelSelection | undefined =>
    value === undefined ? undefined : { ...value }
  const disposeSource = agentCtx.agents.registerModelSelection(agent, {
    current: () => snapshot(selection.current),
    assembled: () => snapshot(selection.assembled),
  })
  const disposeStatus = agentCtx.on('agent/status', ({ agent, status }) => {
    if (agent.ctx === agentCtx && status === 'idle') selection.assembled = undefined
  })
  const disposeAssembly = agentCtx.on('system-prompt/assemble', async (_assembly, _context, next) => {
    const selected = selection.current
    const assembled = await next()
    selection.assembled = selected
    if (selected === undefined) return assembled
    return {
      ...assembled,
      variables: {
        ...assembled.variables,
        provider: selected.provider,
        model: selected.model,
      },
    }
  })
  const disposeRequest = agentCtx.on(
    'agent/request',
    async (_payload, next): Promise<LlmCallConfig> => {
      const resolved = await next()
      const selected = selection.assembled
      if (selected === undefined) return resolved
      const { reasoningEffort: _inheritedEffort, ...withoutInheritedEffort } = resolved
      return {
        ...withoutInheritedEffort,
        provider: selected.provider,
        model: selected.model,
        ...selected.reasoningEffort === undefined
          ? {}
          : { reasoningEffort: selected.reasoningEffort },
      }
    },
  )
  return () => {
    disposeSource()
    disposeStatus()
    disposeAssembly()
    disposeRequest()
  }
}
