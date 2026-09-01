import { authoritativeCode, PartialCodeFieldExtractor } from './partial-code.js'
import type { LiteralToolCallScanner } from './scanner.js'
import type { ToolSpeculationCandidate, ToolSpeculationObserver } from './types.js'

const PARSE_INTERVAL_MS = 50

/** One fail-closed stream tap over a run_code argument JSON object. */
export class RunCodeSpeculationObserver implements ToolSpeculationObserver {
  private readonly extractor: PartialCodeFieldExtractor
  private scanner: LiteralToolCallScanner | undefined
  private lastParseAt = 0
  private ended = false
  private cancelled = false

  constructor(
    maxBufferBytes: number,
    private readonly launch: (candidate: ToolSpeculationCandidate) => void,
    loadScanner: () => Promise<{ new(): LiteralToolCallScanner }>,
    private readonly onCancel: () => void,
  ) {
    this.extractor = new PartialCodeFieldExtractor(maxBufferBytes)
    void loadScanner()
      .then((Scanner) => {
        if (this.cancelled) return
        this.scanner = new Scanner()
        this.scan(true)
      })
      .catch(() => { this.cancelSafely() })
  }

  push(argumentsDelta: string): void {
    if (this.ended || this.cancelled) return
    try {
      this.extractor.push(argumentsDelta)
      if (this.extractor.rejected) {
        this.cancel()
        return
      }
      this.scan(false)
    } catch {
      this.cancelSafely()
    }
  }

  finish(argumentsJson: string): void {
    if (this.cancelled) return
    const finalCode = authoritativeCode(argumentsJson)
    if (!this.extractor.complete || finalCode === undefined || finalCode !== this.extractor.code) {
      this.cancelSafely()
      return
    }
    this.ended = true
    try {
      this.scan(true)
    } catch {
      this.cancelSafely()
    }
  }

  cancel(): void {
    if (this.cancelled) return
    this.cancelled = true
    this.onCancel()
  }

  private cancelSafely(): void {
    try {
      this.cancel()
    } catch {
      // The ToolRuntime-owned cancellation callback must not escape model streaming.
    }
  }

  private scan(force: boolean): void {
    const code = this.extractor.code
    if (code === undefined || this.scanner === undefined) return
    const now = Date.now()
    if (!force && now - this.lastParseAt < PARSE_INTERVAL_MS) return
    this.lastParseAt = now
    for (const candidate of this.scanner.push(code)) this.launch(candidate)
  }
}
