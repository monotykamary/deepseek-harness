/** Ordinary composer submission middleware contracts and registry. */

import type { SessionId } from '@monotykamary/dsh-client-runtime/client'
import type { SubmitOutcome } from '@monotykamary/dsh-client-ui-input-trigger/client'
import type { InputSubmitMode } from '../contract/composer-submission.ts'

/** One serialized ordinary prompt before Host admission. */
export interface ComposerSubmissionRequest {
  /** Session receiving the prompt. */
  readonly sessionId: SessionId
  /** Reference-expanded text exactly as the Host would receive it. */
  readonly text: string
  /** Browser-owned image files in composer order; middleware must not retain them after settlement. */
  readonly images: readonly File[]
  /** Queue or steer delivery selected by the composer policy. */
  readonly mode: InputSubmitMode
  /** Cancellation covering middleware preparation and Host admission. */
  readonly signal: AbortSignal
}

/** Continue the submission middleware chain. */
export type ComposerSubmissionNext = () => Promise<SubmitOutcome>

/** One effect-owned wrapper around ordinary composer admission. */
export interface ComposerSubmissionMiddleware {
  /** Lower orders wrap higher orders; equal orders retain registration order. */
  readonly order?: number
  /**
   * Prepare, replace, or observe one ordinary prompt submission.
   * @param request - serialized prompt, images, delivery mode, and cancellation.
   * @param next - continue toward the Host exactly once; omission consumes the submission.
   * @returns the admitted or consumed outcome reported to the input machine.
   */
  submit(request: ComposerSubmissionRequest, next: ComposerSubmissionNext): Promise<SubmitOutcome>
}

/** Registration face exposed through `ctx.conversation.submissions`. */
export interface ComposerSubmissions {
  /**
   * Register one middleware until its disposer runs.
   * @param middleware - wrapper invoked for every ordinary composer submission.
   * @returns disposer removing that exact registration from later submissions.
   */
  register(middleware: ComposerSubmissionMiddleware): () => void
}

/** Provider and dispatcher for ordinary composer submission middleware. */
export class ComposerSubmissionRegistry implements ComposerSubmissions {
  private entries: Array<{ readonly sequence: number; readonly middleware: ComposerSubmissionMiddleware }> = []
  private sequence = 0

  /** @inheritdoc */
  register(middleware: ComposerSubmissionMiddleware): () => void {
    const entry = { sequence: this.sequence++, middleware }
    this.entries.push(entry)
    return () => {
      const index = this.entries.indexOf(entry)
      if (index >= 0) this.entries.splice(index, 1)
    }
  }

  /**
   * Dispatch through a stable registration snapshot and the terminal Host sink.
   * @param request - serialized ordinary submission.
   * @param sink - terminal Host admission.
   * @returns middleware or Host outcome.
   */
  dispatch(request: ComposerSubmissionRequest, sink: ComposerSubmissionNext): Promise<SubmitOutcome> {
    const entries = [...this.entries].sort((left, right) =>
      (left.middleware.order ?? 0) - (right.middleware.order ?? 0) || left.sequence - right.sequence)
    const invoke = (index: number): Promise<SubmitOutcome> => {
      const entry = entries[index]
      if (entry === undefined) return sink()
      let continued = false
      return entry.middleware.submit(request, () => {
        if (continued) return Promise.reject(new Error('composer submission middleware called next() more than once'))
        continued = true
        return invoke(index + 1)
      })
    }
    return invoke(0)
  }
}
