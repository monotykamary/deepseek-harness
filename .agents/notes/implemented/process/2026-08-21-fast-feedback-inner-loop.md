# Agent Note: Fast inner-loop checks during implementation

Status: implemented

English | [中文](2026-08-21-fast-feedback-inner-loop.zh.md)

## Problem

The golden rule forbade running any test, build, lint, or typecheck between edits, and the sanctioned end checks (test:coverage, test:web, test:snapshot) take hours. A multi-hour feature therefore went unverified until the end, so one typo cost a full gate cycle to discover — a feedback loop with no way to test a single thing. The [GUI testing system note](2026-07-20-gui-testing-system.md) already promised seconds-fast `test:gui` feedback, but the root golden rule contradicted it by banning even that cheap inner loop.

## Decision

Root AGENTS.md now splits validation into two tiers. The inner loop is free during implementation: `pnpm run test:gui` (every client and host GUI package, seconds), `pnpm run test:changed` (vitest scoped to the packages the worktree touched, from [scripts/test-changed.ts](../../../../scripts/test-changed.ts)), `test:changed --coverage` (the aggregate 80% bar on just the changed packages' source), and the watch variants `test:gui:watch` / `test:changed:watch` for single-package iteration. Full-suite gates — test:coverage, test:web, test:snapshot, doc-sync, hygiene, builds — run once when implementation is complete, preserving the original rule's anti-thrash property: after a gate failure, finish the repair pass before rerunning. CI remains the exhaustive authority; the scoped coverage run is a local proxy, never a substitute.

## Alternatives considered

**Keep the old rule.** Rejected: it produced the blind multi-hour implementation loop this note replaces; its anti-thrash intent survives in the gates-once clause.

**Run full typecheck or build between every edit.** Rejected: whole-repo tsc and bundling cost minutes per run, reintroducing the wait for a single-package change; the scoped vitest lanes give seconds-level signal where the cost is worth it.

**Document-only change.** Rejected: without mechanical commands and a rewritten rule, agents would still default to full-suite runs or to none.

## Consequences

Implementation sessions verify each step in seconds-to-minutes and repair forward instead of discovering breakage at the end; the feedback loop now tracks the actual feature surface. The changed-package scope is a git-diff heuristic, so cross-package ripple effects still surface at gate time — CI owns exhaustive coverage and the platform matrix. `test:changed --coverage` measures only the changed packages' src, so it cannot stand in for the full coverage gate on a merge path.
