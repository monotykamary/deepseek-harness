interface FileSaveCoordinatorOptions {
  readonly debounceMs: number
  readonly persist: (contents: string) => Promise<boolean>
  readonly onPendingChange: (pending: boolean) => void
  readonly onError: (error: unknown) => void
}

/** T3-adapted single-flight debounce coordinator for complete-file saves. */
export class FileSaveCoordinator {
  private timer: ReturnType<typeof setTimeout> | null = null
  private latestContents = ''
  private latestRevision = 0
  private lastChangeAt = 0
  private saving = false
  private disposed = false

  /** @param options - debounce timing, persistence callback, and status sinks. */
  constructor(private readonly options: FileSaveCoordinatorOptions) {}

  /**
   * Queue the newest complete source value for persistence.
   * @param contents - complete editor value replacing any older queued value.
   */
  change(contents: string): void {
    this.latestContents = contents
    this.latestRevision += 1
    this.lastChangeAt = Date.now()
    this.options.onPendingChange(true)
    this.schedule(this.options.debounceMs)
  }

  /** Flush the newest queued value immediately when no write is in flight. */
  saveNow(): void {
    this.clearTimer()
    void this.persistLatest()
  }

  /** Cancel the debounce timer and request one final save of the newest queued value. */
  dispose(): void {
    this.disposed = true
    this.clearTimer()
    if (this.latestRevision > 0) void this.persistLatest()
  }

  private schedule(delay: number): void {
    this.clearTimer()
    this.timer = setTimeout(() => {
      this.timer = null
      void this.persistLatest()
    }, delay)
  }

  private clearTimer(): void {
    if (this.timer === null) return
    clearTimeout(this.timer)
    this.timer = null
  }

  private async persistLatest(): Promise<void> {
    if (this.saving || this.latestRevision === 0) return

    this.saving = true
    const contents = this.latestContents
    const revision = this.latestRevision
    let succeeded = false
    try {
      succeeded = await this.options.persist(contents)
    } catch (writeError: unknown) {
      this.options.onError(writeError)
    }
    this.saving = false

    if (revision === this.latestRevision) {
      if (succeeded) {
        this.latestRevision = 0
        this.options.onPendingChange(false)
      }
      return
    }

    if (this.disposed) {
      void this.persistLatest()
      return
    }
    const remainingDebounce = Math.max(
      0,
      this.options.debounceMs - (Date.now() - this.lastChangeAt),
    )
    this.schedule(remainingDebounce)
  }
}
