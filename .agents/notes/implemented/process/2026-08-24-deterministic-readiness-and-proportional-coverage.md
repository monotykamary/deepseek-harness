# Agent Note: Deterministic revision readiness and proportional coverage

Status: implemented

English | [中文](2026-08-24-deterministic-readiness-and-proportional-coverage.zh.md)

## Problem

Full validation mixed deterministic product evidence with host-scheduler observations, so one filesystem or PTY timing miss could reject an otherwise stable revision. Per-file 100% coverage encouraged suppression directives, branch-tail tests, broad exclusions, and repeated instrumented runs whose cost exceeded their confidence. Release pack feedback remained independent in workflow topology but lacked a mechanically stated relation to revision readiness.

## Decision

A revision `r` is ready exactly when its evidence set is complete and every required deterministic check succeeds on that revision: `Ready(r, E) ⇔ ids(E) = R ∧ ∀e ∈ E: e.revision = r ∧ e.result = success`. [`scripts/readiness.ts`](../../../../scripts/readiness.ts) owns `R` and the pure evaluator; the CI workflow test pins the required GitHub `needs` set to it. Missing, duplicate, unexpected, failed, skipped, cancelled, or foreign-revision evidence rejects readiness.

Required tests synchronize on causal state. A test whose host timing cannot be controlled moves to `test:observational`; it still runs and reports failures, but neither `run-gates` nor the stable CI aggregate treats that result as readiness evidence. Retries and enlarged sleeps do not convert an observation into a required test. Native HMR watcher delivery and macOS PowerShell PTY timing use this lane.

Coverage is an aggregate floor of 80% for statements, branches, functions, and lines across measured package source. Coverage suppression directives are absent, and only types, self-executing entries, generated build-only entries, intentionally uninstrumented generator source, and source unavailable on the current host remain outside measurement. Slow deterministic correctness suites run uninstrumented beside coverage and remain blocking.

The hosted macOS deterministic parity run caps Vitest at two workers. This bound keeps both project-level fork pools within the runner's fixed memory while preserving the complete required unit inventory; a process crash remains blocking rather than being reclassified as an observation.

Release workflows start version verification, official build, pack, packed-install verification, and artifact upload without depending on full CI jobs. For family `f`, release feedback succeeds exactly when `Version_f(r) ∧ Build_f(r) ∧ Pack_f(r) ∧ Install_f(r)` succeeds; registry publication additionally requires the protected environment and the pack job. Full rehearsals can continue independently without delaying this feedback path.

## Alternatives considered

**Keep per-file 100% coverage.** Rejected because complete execution is not complete behavior evidence and the last percentage produced disproportionate test, suppression, exclusion, and instrumentation cost.

**Retry flaky required tests or increase their waits.** Rejected because either approach makes readiness probabilistic and can publish a green result without changing the tested behavior.

**Drop uncontrollable observations.** Rejected because their signal remains useful for host integrations; the observational lane preserves it without making an unstable scheduler outcome authoritative.

**Make full CI a release-workflow dependency.** Rejected because pack/install feedback answers a separate exact-revision question and must remain available while broader rehearsals finish.

## Consequences

Readiness composition is exhaustive over a finite declared set and deterministic for one revision, while it cannot prove the absence of defects outside that evidence. Coverage reports actual execution rather than suppression-adjusted execution. Host-specific failures stay visible, and maintainers must either establish causal synchronization or keep the test observational. Release packaging reports promptly and still fails closed on any version, build, tarball, install, approval, or publication error it owns.
