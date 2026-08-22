/**
 * Durable Tool event vocabulary shared with type-only consumers.
 *
 * @module @monotykamary/dsh-tools/types
 */

import type { CallId } from '@monotykamary/dsh-llm/brand'
import type { ContentBlock } from '@monotykamary/dsh-llm/types'
import type { FileMutation } from '@monotykamary/dsh-session/types'

/** Payload recorded when one nested Code Mode Tool dispatch starts. */
export interface CodeDispatchStartEventData {
  rootCallId: CallId
  parentCallId: CallId
  subCallId: CallId
  name: string
  arguments: unknown
  /** Agent-loop position of the owning root call, when loop-dispatched. */
  location?: { turn: number; step: number }
}

/** Payload recorded when one nested Code Mode Tool dispatch settles. */
export interface CodeDispatchEventData extends CodeDispatchStartEventData {
  isError: boolean
  content: ContentBlock[]
  /** Workspace-file mutations committed by the nested call. */
  mutations?: FileMutation[]
}

declare module '@monotykamary/dsh-session/types' {
  interface SessionEventMap {
    /**
     * One sub-dispatch STARTING inside a `run_code` program: the parent
     * `run_code` call id, the deterministic sub-call id (`<parent>:code:<n>`,
     * numbered in submission order), and the tool `name` with its
     * JSON-normalized `arguments` — the exact value dispatched, normalized
     * BEFORE dispatch, so this append can never fail on payload shape.
     * Appended when the scheduler actually starts the call (not at
     * submission), so a start means the tool body pipeline was entered; a
     * call abandoned in the queue logs nothing. Log-only: `deriveMessages()`
     * ignores it; UIs use it for live per-sub-call running state and pair it
     * with `tool/code-dispatch` by `subCallId` (timing = the two events'
     * `time` fields).
     */
    'tool/code-dispatch-start': CodeDispatchStartEventData
    /**
     * One bridged sub-dispatch SETTLING: the pairing ids (matching the
     * `tool/code-dispatch-start` with the same `subCallId`), the tool `name`
     * with the same JSON-normalized `arguments`, and the sub-call's complete
     * model-facing outcome in `tool/result`'s own vocabulary
     * (`content` + `isError`), so UIs render a sub-call through the exact
     * code path that renders a native call. Every started sub-call settles
     * with exactly one of these (abort included: the aborted pipeline result
     * is an `isError` outcome).
     * Log-only: `deriveMessages()` ignores it, so sub-calls never re-enter
     * model context; persistence and UIs get every call. Appended inside the
     * parent `run_code`'s execution (the bridge drains in-flight dispatches
     * before returning), so its execution-enclosure relation holds by
     * construction.
     */
    'tool/code-dispatch': CodeDispatchEventData
  }
}
