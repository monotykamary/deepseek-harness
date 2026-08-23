# Agent Note: Bounded settled assistant history

Status: implemented

English | [中文](2026-08-23-bounded-settled-assistant-history.zh.md)

## Problem

`session.history` and `subagent.history` returned every durable `assistant/chunk` beside the append-origin `assistant/message` that already contains a settled step's content and usage. A long code-mode response could put thousands of redundant token events into one page, making a phone spend its unary timeout and heap budget downloading and parsing data the reopened transcript does not need.

Removing every settled chunk would also remove the first-token timestamp used by historical TTFT and could move the first returned seq past the raw page cut. The browser uses that seq as the next `beforeSeq`; moving it would fetch the omitted chunks on the older page and defeat the reduction.

## Decision

The gateway paginates the complete event range first, then projects each step with an append-origin `assistant/message` to that message plus its first token delta. When the raw page starts with another chunk from the same settled step, that first event also remains as the stable pagination cursor. A single chunk can satisfy both rules.

Steps without a final append-origin message retain every chunk, preserving in-flight and interrupted output. `session.history` and `subagent.history` share this projection through `historyPage`; live mux frames, persistence, forks, and session-log export retain the complete event stream.

## Alternatives considered

**Raise the unary timeout.** A larger timeout still transfers and parses the redundant token tape, increasing mobile latency and peak memory instead of bounding the payload.

**Drop every settled chunk.** This loses historical TTFT and shifts `beforeSeq` past the raw cut when the oldest message group begins with chunks, causing load-older to retrieve the tape.

**Rewrite or compact the durable log.** The chunk stream remains authoritative evidence for export, replay, diagnostics, and non-browser consumers; a browser history projection is the narrower ownership point.

## Consequences

A history page carries at most two small chunk anchors per settled step and keeps complete chunks only for unfinished output. Reopened Chat and Trajectory content and usage settle from `assistant/message`, first-token timing remains available, and page-up cannot retrieve an omitted settled tape. Tool code-dispatch events and other large records remain outside this reduction.
