# Agent Note: Durable tool mutation receipts

Status: implemented

English | [中文](2026-08-22-durable-tool-mutation-receipts.zh.md)

## Problem

The Web Changes panel inferred file mutations from tool presentation metadata. That made a UI card declaration act as execution evidence, omitted nested Code Mode calls, and excluded mutators whose presentation did not contain a diff. Git state could list repository differences but could not attribute a committed operation to its Session, Turn, tool call, or execution order.

## Decision

`ToolRunContext.recordFileMutation()` records a detached `FileMutation` receipt only after a tool commits a workspace-file operation. A receipt names the path, file-level `create`, `modify`, or `delete` operation, and ordered textual hunks. The registry attaches recorded receipts to the final `ToolExecutionResult` after post-execute policy and content finalization, so a later result replacement or policy block cannot erase an operation that already committed.

The agent loop supplies each root execution with its owning `{ turn, step }` location. Direct receipts are stored on `tool/result`; Code Mode propagates the root location to sub-dispatches and stores each nested call's receipts on its own `tool/code-dispatch` event. The outer `run_code` result does not duplicate nested receipts.

The closing Turn renders its receipts as a low-contrast changed-files card rather than a basename-chip lane. The card reports aggregate line statistics, keeps its directory tree visible, reports per-directory and per-file statistics, collapses all folders through a restrained text action, and opens the full Changes workbench from its header or any file row. The workbench joins each disclosure header directly to a seamless diff body without a duplicate path, rounded nested card, or footer. Diff chrome receives labels from its locale owner; English surfaces no longer inherit Chinese primitive defaults.

`@monotykamary/dsh-client-ui-deliverables` derives produced files and loaded Changes exclusively from these durable receipts. Presentation metadata may still supply a display title, but it cannot create a mutation entry. Deletes remain visible as changes and do not produce an openable-file chip. The first-party `write`, `edit`, and `str_replace_editor` mutators emit receipts at their successful filesystem commit points. The linked dsh-fabric `schema_commit` integration records each committed transaction's net text changes after its authoritative workspace generation advances.

## Verification

Tool-runtime tests pin receipt detachment and preservation through a blocking post-execute decision. Agent-loop and Code Mode tests pin direct and nested event persistence with Turn and step attribution. Filesystem-tool tests pin receipts for create, complete write, literal replacement, text deletion, and insertion. Deliverables tests pin direct and nested receipt projection, delete handling, malformed wire-data rejection, replay, and incremental updates.

## Alternatives considered

**Continue deriving changes from presentation intent.** Render intent describes how to display a call before and after execution; it does not prove that a mutation committed. It also leaves composite transports and generic mutators dependent on unrelated UI conventions.

**Derive the panel from Git status and diffs.** Git can summarize the current working tree, including terminal and external changes, but it loses Session ownership, tool-call order, repeated edits, and the distinction between agent and external work. It also fails outside Git worktrees.

**Add mutator-specific session events.** Separate events for each filesystem tool would duplicate ordering, failure, and Code Mode correlation rules and require the client to know every mutator name. One execution-level receipt API lets any tool report the same durable fact.

**Aggregate nested receipts onto `run_code`.** Aggregation would make the outer result convenient to inspect but duplicate each operation in the log and erase the nested call that committed it. Keeping receipts on sub-dispatch events preserves exact attribution.

## Consequences

The Session log can reconstruct agent-authored text mutations in execution order without consulting Git or tool presentation metadata, and future consumers can fold the same receipts into patch-like exports or audit views. The cost is duplicated text in durable receipts, explicit instrumentation for every mutator, and no automatic coverage for terminal commands, external processes, browser file editing, binary changes, or tools that do not call the recorder. Git remains the authority for repository-wide current state; the receipt ledger is the authority for instrumented Session mutations.
