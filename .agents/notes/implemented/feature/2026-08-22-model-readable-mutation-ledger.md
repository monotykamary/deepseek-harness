# Agent Note: Model-readable mutation ledger

Status: implemented

English | [中文](2026-08-22-model-readable-mutation-ledger.zh.md)

## Problem

The Web Changes view presents committed `FileMutation` receipts, but the model cannot revisit those durable facts after their original tool results leave its useful context. Turning the ledger into a user-exportable patch would require source coordinates, complete file states, path normalization, storage retention, and patch application semantics that duplicate responsibilities associated with version-control systems. The immediate need is narrower: let the current Session's model inspect prior tool-authored intent and compare it with ordinary current-file reads before making a new forward mutation.

## Decision

The Host package `@monotykamary/dsh-tool-session-mutations` registers `changes_read` and exports the pure `./ledger` projection for external automation. The tool reads the calling agent's complete in-memory Session log, combines direct `tool/result` and nested `tool/code-dispatch` receipts, and sorts each mutation by its durable `commitOrder`; it does not derive from the browser's paged Changes projection. The shipped Web patch mounts it beside the Client-owned `@monotykamary/dsh-client-ui-deliverables` Changes feature without adding that Client package to the Host compiler face.

A call without `commit_order` lists bounded summaries after an optional `after_commit_order`. Each summary reports path, operation, added and removed receipt lines, and available complete-content SHA-256 identities. A call with `commit_order` returns that mutation's recorded replacement hunks, hashes, and path in bounded pages selected by an opaque UTF-16 `offset`. Deployment-required `maxListItems` and `maxDiffChars` values control both bounds.

Every result states that the ledger covers receipt-aware tool mutations only. The output is recorded intent, not unified-patch syntax, repository state, or proof that no shell or external edit occurred. The model uses ordinary filesystem reads to inspect current content and writes any reconciliation as another normal file mutation; `changes_read` never reads or writes the workspace.

The shipped Web composition loads the tool at process scope beside the deliverables plugin, so every Web preset sees its schema and execution resolves the owning Session. Headless compositions without the reader pay no schema cost. Tool results follow ordinary Session logging, so a model-visible ledger page remains reconstructable without a new Session event type.

## Alternatives considered

**Export Git-compatible patches.** Rejected because correctness requires complete base and final states, canonical paths, newline and file-mode semantics, application tests, and storage lifecycle. That scope recreates version-control responsibilities rather than serving model review.

**Store every complete file state in a content-addressed service.** Deferred because contextual receipt hunks and hashes satisfy the current review workflow without a new durable storage capability or post-commit storage failure mode.

**Generate model context from the browser Changes view.** Rejected because browser history is paged and UI state is not a model-visible durable source.

**Inject every mutation automatically.** Rejected because repeated diff text would grow every subsequent request. A bounded tool keeps the schema prefix stable and loads details only when the model needs them.

## Consequences

The model can list and revisit changes across the complete live Session, including nested Code Mode mutations, then reconcile against current files by writing forward. The Host-owned package adds one fixed tool schema to Web model requests and bounded result text only when called; external schedulers can consume `./ledger` after the complete DSH package is built. Existing receipt limitations remain explicit: paths are producer display paths, hunk text is presentation-oriented rather than an applicable patch, terminal and external mutations are absent, and persisted sessions must be loaded as a live agent before the tool can inspect them.
