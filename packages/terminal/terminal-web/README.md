# @monotykamary/dsh-terminal-web

English | [中文](README.zh.md)

Host Consumer that exposes Agent-owned persistent terminals to the same-origin Web client at `/api/terminal`. It registers a full-duplex WebSocket upgrade through `ctx.connection`, so Host/Origin checks and optional identity admission run before this package receives a socket. Every operation resolves the selected Agent and delegates authorization to the Host `ctx.terminals` registry; browser clients cannot attach terminal sessions created for model tools.

## Operations and framing

A new socket starts with one JSON text handshake: `list`, `open`, `attach`, or `kill`. `open` creates a placement-named native interactive login shell in the selected Session cwd and forwards the requested initial grid; `list` returns only terminals owned by that browser placement. An attached socket carries UTF-8 terminal input as binary client frames, raw PTY output as binary Host frames, and `resize`, `kill`, `ready`, `exit`, `pong`, or failure controls as JSON text frames. Closing a socket detaches without killing the persistent process.

Output is combined into bounded short-window frames. A slow browser is disconnected before the WebSocket queue exceeds `maxBufferedBytes`; input size, handshake time, and PTY dimensions are bounded at the wire parser. Plugin disposal terminates accepted sockets, detaches their streams, and awaits queued terminal operations.

## Configuration

| Field | Default | Meaning |
|---|---:|---|
| `backendType` | `shell` | `ctx.terminals` backend used by `open`. |
| `maxInputBytes` | 65,536 | Maximum bytes in one client input/control frame. |
| `outputBatchBytes` | 65,536 | Maximum bytes combined before immediate output flush. |
| `outputBatchWindowMs` | 8 | Maximum delay for a partial output batch. |
| `maxBufferedBytes` | 4,194,304 | WebSocket queue limit before disconnect. |
| `handshakeTimeoutMs` | 10,000 | First-frame deadline. |
| `maxCols` / `maxRows` | 1,000 | Accepted PTY dimension limits. |

## Model Experience

None, as this browser transport adds no model-visible input or output.

#### KV Cache effect

None; WebSocket input bypasses model requests.

## Known Limitations and Deferred Work

- Terminal bytes and attachments remain process-local; a Host restart ends every browser terminal.
- The wire sends raw output without application-level compression.
- One socket attaches one terminal; multiplexing occurs through independent sockets and UI tabs.
