# Agent Note: Atomic terminal transport frames

Status: implemented

English | [中文](2026-08-19-atomic-terminal-transport-frames.zh.md)

## Problem

The Host already batches PTY output and the browser already batches xterm writes, but every binary payload still crossed the Host-to-browser boundary as an independently scheduled replay or live event. A redraw of a trimmed frame could then interleave with other output while the browser was purchasing a server batch, extra active stamps, and client debounce windows. Chat replay lists could pass unrelated output, and full-terminal attachment with active panes could send the creation `ready` control after earlier replay bytes.

## Decision

Adapt localterm's atomic output transport framing to this transport's existing WebSocket protocol. The Host emits one contiguous binary `chunkId` per published PTY event while `output-frame-start` and `output-frame-end` delimit the logical frame. `attachHistory` emits an inert empty bracket immediately after `ready`, so the client marks its first replay staging pass complete without forwarding bytes. Terminal-state replay purchases the staged attachment history at publish time and marks each pane's advancement pass as already delivered. The browser stages every payload between the two controls, concatenates its bytes, and forwards exactly one xterm write on `output-frame-end`; pre-connect boundary controls seed the empty pass while binary bytes remain queued before readiness. The wire bound is the deliberate 128 KiB payload-size default callers already accept, so a Host-side close also closes replay staging.

The atomic framing transport policy adapts localterm revision `8de7394eb06cf562985d8f82d5a8145863cb8ecd` and [`THIRD_PARTY_NOTICES.md`](../../../../THIRD_PARTY_NOTICES.md) retains its complete MIT notice.

## Alternatives considered

**Change the Host port event contract.** Agents subscribe to `port/output`, so moving from one event per attachment batch to one event per atomic frame would change the durable replay unit and every subscriber for a transport-only concern.

**Wait for a proprietary output-id collector.** Atomicity belongs to the transport protocol. Frame delimiters preserve existing output events while ensuring each attachment receives the start, payload, and end sequence without a shared cache.

## Consequences

Browser attachments preserve server event order during readiness, replay, and live delivery: bracket controls before `ready` cannot interleave with binary payloads, and replay cannot surface a resized split pane out of a live frame. A terminal list request no longer serializes replay for unrelated panes. The 128 KiB output bound remains explicit and rejects oversized frames with a transport error rather than writing a partial trimmed frame. Focused host and client suites cover boundary presentation, creation-before-replay ordering, oversized-stage closure, stale client server frames, invalid control rejection, and full per-file coverage on the touched server and client transport files.
