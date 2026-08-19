/** Browser-safe wire vocabulary for interactive terminal WebSockets. */

/** Exact same-origin WebSocket pathname owned by `@monotykamary/dsh-terminal-web`. */
export const TERMINAL_WEBSOCKET_PATH = '/api/terminal'

/** Independent browser terminal placements inside one Session. */
export type BrowserTerminalPlacement = 'bottom' | 'right'

/** Top-level process status projected onto JSON control frames. */
export type BrowserTerminalStatus =
  | { readonly kind: 'running' }
  | { readonly kind: 'exited'; readonly exitCode: number | null; readonly signal: string | null }

/** Browser-visible terminal identity and process status. */
export interface BrowserTerminalSnapshot {
  readonly terminalId: string
  readonly label: string
  readonly status: BrowserTerminalStatus
}

/** First text frame selecting one terminal operation for a new socket. */
export type BrowserTerminalHandshake =
  | { readonly type: 'list'; readonly sessionId: string; readonly placement: BrowserTerminalPlacement }
  | {
    readonly type: 'open'
    readonly sessionId: string
    readonly placement: BrowserTerminalPlacement
    readonly cols: number
    readonly rows: number
  }
  | {
    readonly type: 'attach'
    readonly sessionId: string
    readonly terminalId: string
    readonly cols: number
    readonly rows: number
  }
  | { readonly type: 'kill'; readonly sessionId: string; readonly terminalId: string }

/** Text control frames accepted after an attachment becomes ready. */
export type BrowserTerminalClientControl =
  | { readonly type: 'resize'; readonly cols: number; readonly rows: number }
  | { readonly type: 'kill' }
  | { readonly type: 'ping'; readonly sentAt: number }

/** Host text frames; raw terminal output uses binary WebSocket frames. */
export type BrowserTerminalServerControl =
  | { readonly type: 'list'; readonly terminals: readonly BrowserTerminalSnapshot[] }
  | {
    readonly type: 'ready'
    readonly terminal: BrowserTerminalSnapshot
    readonly replayTruncated: boolean
  }
  | { readonly type: 'exit'; readonly status: BrowserTerminalStatus }
  | { readonly type: 'killed'; readonly terminalId: string }
  | { readonly type: 'pong'; readonly sentAt: number }
  | { readonly type: 'error'; readonly code: string; readonly message: string }
