# Agent Note: Code Mode binding rejection containment

Status: implemented

English | [中文](2026-08-26-code-mode-binding-rejection-containment.zh.md)

## Problem

A CodeRuntime may invoke a `run_code` binding and then settle its guest without retaining the returned Promise. This occurs when generated code omits `await`, when a compound guest operation settles early, or when runtime cleanup drops a pending host call. The bridge must still abort and drain its nested calls. An in-flight binding then rejects with `result discarded`, while a queued unstarted binding rejects with `tool call abandoned`.

Those rejections are correct for a runtime that awaits the binding. When the runtime has dropped the Promise, however, the same rejection reaches Node as `unhandledRejection`. The application boot fail-loud handler intentionally treats every otherwise-unowned rejection as fatal, so one malformed `run_code` program could terminate a long-running `dsh web` process after the run had already settled.

## Decision

The binding factory starts one dispatch operation, immediately attaches a rejection observer to that operation, and returns the original Promise unchanged. The observer owns only host-process containment: it does not return a replacement Promise, convert rejection to success, or alter the error. A runtime that awaits the call therefore receives the same tool failure, result-discarded failure, or queued-abandonment failure as before. A runtime that drops it no longer leaves a process-level rejection without an owner.

The scheduler retains its existing settlement discipline. Run settlement aborts active calls, abandons queued unstarted calls, drains started calls and their ordered commits, records events only for calls that started, and returns only after those owned operations reach quiescence.

## Alternatives considered

**Teach the process fail-loud handler to ignore abandonment messages.** Rejected because that global handler cannot prove which rejection was safely detached; message filtering would hide genuine lifecycle defects from unrelated plugins.

**Resolve discarded or abandoned bindings successfully.** Rejected because a caller awaiting the binding must not observe a value from work that never ran or whose result belongs to an ended run.

**Require every CodeRuntime to retain every binding Promise.** Rejected as the only defense because provider cleanup and malformed guest code can still drop a call. The core bridge creates the rejecting Promise and can contain it without weakening provider-visible semantics.

## Consequences

- Dropped in-flight and queued binding Promises cannot reach `process.unhandledRejection` during `run_code` drain.
- Awaited or explicitly caught bindings preserve their exact rejection messages.
- The process fail-loud policy remains strict for all genuinely unowned rejections.
- A focused regression uses a runtime that deliberately drops two calls and proves both discard and abandonment stay contained; the existing caught-abandonment test proves the original Promise still rejects unchanged.
