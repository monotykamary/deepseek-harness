import type { Agent } from '@monotykamary/dsh-agent'
import type { CallId } from '@monotykamary/dsh-llm'
import type { JsonValue } from '@monotykamary/dsh-session'
import type { ToolExecutionLocation, ToolRunContext } from '../index.js'

/** Deployment bounds for streamed Code Mode speculation. */
export interface ToolSpeculationConfig {
  /** Master switch. Disabled deployments never load the TypeScript scanner. */
  enabled: boolean
  /** Maximum speculative calls that may still be running. */
  maxConcurrent: number
  /** Maximum unserved entries retained across active root calls. */
  maxEntries: number
  /** Maximum raw streamed argument bytes buffered for one run_code call. */
  maxBufferBytes: number
  /** Maximum total bytes of validated unserved canonical values. */
  maxRetainedBytes: number
  /** Maximum age of an unserved entry. */
  entryTtlMs: number
}

/** Restricted context for work launched before the ordinary tool policy pipeline. */
export interface ToolSpeculationContext {
  readonly rootCallId: CallId
  readonly agent?: Agent
  readonly location?: ToolExecutionLocation
  readonly signal: AbortSignal
}

/** A hidden result that can be validated and committed at the natural call point. */
export interface ToolSpeculationResult<T = JsonValue> {
  readonly value: T
  /** Optional serve-time check for state that can change outside nested tool calls. */
  readonly isFresh?: (exec: ToolRunContext) => boolean | Promise<boolean>
  /** Replay deferred observation/audit side effects only after the real call is allowed. */
  readonly replay?: (exec: ToolRunContext) => void | Promise<void>
}

/** One statically complete SDK call found in a growing TypeScript program. */
export interface ToolSpeculationCandidate {
  readonly name: string
  readonly arguments: Record<string, unknown>
}

/** Opportunistic counters. They never affect authoritative execution. */
export interface ToolSpeculationStats {
  launched: number
  served: number
  epochInvalidated: number
  freshnessInvalidated: number
  definitionInvalidated: number
  failed: number
  wasted: number
  skipped: number
}

/** Agent-loop handle for one streamed run_code argument object. */
export interface ToolSpeculationObserver {
  push(argumentsDelta: string): void
  finish(argumentsJson: string): void
  cancel(): void
}
