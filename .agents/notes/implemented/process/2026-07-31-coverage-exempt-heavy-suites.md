# Agent Note: Coverage-exempt slow correctness suites

Status: implemented

English | [中文](2026-07-31-coverage-exempt-heavy-suites.zh.md)

## Problem

Compiler analysis, subprocess products, browser-like rendering, differential persistence, and worker integration are materially slower under v8 instrumentation. Their behavior remains required, but making every such suite contribute coverage lengthens the readiness path without improving the aggregate metric enough to justify the cost.

## Decision

The CI coverage aggregate runs two blocking checks in parallel:

- The instrumented check sets `DSH_COVERAGE_EXEMPT_HEAVY=1`, excludes the roster in [`scripts/coverage-exempt.ts`](../../../../scripts/coverage-exempt.ts), and enforces the repository’s aggregate 80% threshold.
- The uninstrumented check runs every roster entry as ordinary required tests. A failure rejects the aggregate even though its coverage is not measured.

The roster contains the generator, worker and real-product integrations, snapshot harness, differential persistence, expensive client rendering suites, subagent lifecycle suites, and repository scripts that spawn or compile substantial fixtures. A suite belongs there when instrumentation materially increases its cost and its pass/fail behavior matters more than its contribution to the aggregate execution percentage. Host-timing observations use the separate nonblocking lane defined by [deterministic revision readiness](2026-08-24-deterministic-readiness-and-proportional-coverage.md), never this blocking roster.

Each roster row owns both a positional Vitest filter and an exclude glob. `scripts/coverage-exempt.spec.ts` resolves both against the repository inventory, requires the same non-empty set, and rejects overlaps. `DSH_COVERAGE_MAX_WORKERS` divides workers evenly between instrumented and uninstrumented checks; partitioned CI replaces only the instrumented share.

## Alternatives considered

**Instrument every required test.** Rejected because v8 multiplies the cost of whole-workspace compiler, subprocess, worker, and rendering fixtures while coverage is only one readiness input.

**Skip slow suites.** Rejected because their real implementation and process evidence remains required; only instrumentation is removed.

**Put flaky host observations in this roster.** Rejected because this check remains blocking. Uncontrollable observations belong in `test:observational`.

**Shard across workflow jobs.** Rejected because repeated checkout, installation, artifact transport, and a merge job add topology without improving the evidence.

## Consequences

Coverage reaches its 80% aggregate floor using the faster instrumented inventory, while every slow deterministic suite still must pass. The roster is explicit and mechanically synchronized, but moving a suite changes which execution contributes to the percentage and therefore requires review. The uninstrumented check can become the critical path as the roster grows, so CI timing data governs worker allocation and future entries.
