/** Ordinary composer submission middleware contracts and registry. */

import type { SubmitOutcome } from '@monotykamary/dsh-client-ui-input-trigger/client'
import type {
  ComposerSubmissionMiddleware, ComposerSubmissionNext, ComposerSubmissionRequest, ComposerSubmissions,
} from '../contract/input.ts'

export type {
  ComposerSubmissionMiddleware, ComposerSubmissionNext, ComposerSubmissionRequest, ComposerSubmissions,
} from '../contract/input.ts'

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
