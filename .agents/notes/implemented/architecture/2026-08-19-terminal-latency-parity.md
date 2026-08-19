# Agent Note: Terminal latency parity

Status: implemented

English | [中文](2026-08-19-terminal-latency-parity.zh.md)

## Problem

The browser renderer uses LocalTerm's xterm versions, WebGL path, output scheduler, scroll anchoring, Unicode corrections, and ligature handling, but interactive echo still crossed an eight-millisecond Host batch timer and two promise-tail queues before the local PTY write. The timer could move a small shell echo past the current compositor frame, while promise-tail dispatch deferred an otherwise synchronous `node-pty` write to later microtasks. Kernel PTY writes also acquired redundant `Buffer` copies before the WebSocket batcher. The backend's retained text split and rejoined the complete bounded history on every chunk, while raw replay removed leading chunks with `Array.shift()`; sustained animation therefore accumulated history-proportional work that survived an application reset inside the same PTY.

## Decision

Terminal Web output uses LocalTerm's two-millisecond trailing idle window: every kernel fragment resets the timer, 65,536 bytes flush immediately, and `outputStreamThresholdMs` bounds a continuous partial burst at 100 milliseconds by default. `TerminalOutputBatcher` owns this timing separately from WebSocket backpressure so fake-clock tests pin the idle and stream cases. Immutable Node stream buffers pass through the raw replay and browser fan-out paths without copies that exist only to recover the same `Buffer` type. Raw replay and line-oriented retention use leading-trim deques: append and eviction touch only new or discarded chunks, consumed prefixes compact in batches, and snapshot/read operations alone concatenate retained data.

`SerialOperationQueue` replaces promise-tail serialization in the Web consumer and terminal backend. Its first operation starts in the accepting task, so a local provider reaches synchronous `node-pty.write()` without a microtask delay. An asynchronous or remote provider still holds the queue until settlement; later operations remain FIFO, one failure does not block successors, and `idle()` remains the teardown quiescence point. The backend queue remains authoritative across all viewers, while the Web queue preserves input, resize, and kill order for one socket.

## Consequences

Small local echoes reach the browser after a two-millisecond idle edge and can use the copied bounded post-input WebGL render path in the current compositor frame. Continuous partial output cannot remain buffered indefinitely, and large output retains the existing size and backpressure bounds. Animation cost no longer grows with retained text or raw chunk count, and restarting an animation in the same PTY does not inherit history-wide append work. The public queue utility gives terminal providers and consumers one ordering implementation instead of parallel promise-tail variants.

Predictive local echo is deliberately absent. An arbitrary native login shell does not expose an authoritative prompt-versus-password state to the browser; rendering speculative characters could reveal input suppressed by `read -s`, password prompts, or other shell builtins. PTY echo remains the only authority until a shell integration can publish that state without replacing user startup behavior.

## Verification

Terminal package tests pin synchronous first dispatch, FIFO settlement through failures, quiescence, two-millisecond trailing resets, the 100-millisecond stream bound, asynchronous frame ordering, multi-viewer resize ownership, accepted-input draining, incremental retention equivalence across newline and UTF-8 chunk boundaries, deque compaction, WebSocket backpressure, and protocol cleanup. The interactive Web terminal journey remains the assembled test for native login-shell input, persistent attachment, and cross-viewer output.

## Alternatives considered

**Only change the timer default.** Rejected because the idle local write would still cross both promise-tail microtasks and every PTY chunk would retain avoidable copies.

**Port LocalTerm's predictive echo without shell state.** Rejected because normal-buffer state cannot distinguish a shell prompt from intentionally hidden input.

**Remove serialization for local providers.** Rejected because remote subprocess providers and concurrent viewers require one ordering rule; synchronous-first FIFO dispatch removes local delay without weakening that rule.
