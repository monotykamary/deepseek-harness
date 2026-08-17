# Agent Note: Upstream sync through 0.1.0-rc.7 with rescope adaptation

Status: implemented

English | [中文](2026-08-17-upstream-sync-rc7.zh.md)

## Problem

The fork was 111 commits behind upstream deepseek-ai/deepseek-harness (through release 0.1.0-rc.7) and 13 ahead. The gap included fix #2585: tool-bash-persistent overwrote the backend's PS1, so terminal-bash prompt readiness never matched and every send degraded to the 3.5 s silence tier (idleSilenceMs + handoffGraceMs) under production defaults — the exact degradation documented in the prompt-fix note. Merging naively would collide with the fork's @monotykamary rescope (3408 files renamed), its telemetry removal, web SSO/tailnet features, and llm retry fixes.

## Decision

Merge upstream/master into master, adapting conflicts to the fork's stance:

- Where the fork side of a conflict was only the rescope rename, take upstream's content and re-apply `@deepseek-ai` → `@monotykamary`. The rename is mechanical (the rescope commit is a 1:1 substitution; GitHub URLs stay unchanged).
- Adopt upstream's superseding fixes wholesale: the controlled-prompt PROMPT_COMMAND self-healing, the ReplayEnvelope replay-state redesign (which subsumes the fork's earlier max-tokens replay-drop fix), and the stdin_read no-marker fallback. Delete fork tests that encoded the superseded replay design.
- Merge fork features by hand where both sides changed the file: api-proxy.ts keeps the SSO identity.mayAccess partition checks (reconstructed via merge-file after an over-broad conflict resolution), docs-pages.yml keeps DOCS_REPOSITORY_REF but not the removed DSH_TELEMETRY_DISABLED seam.
- Reconcile the lockfile with the merged package manifests (node-pty 1.2.0-beta.15), re-record translation-pairing hashes, and let the gates regenerate catalogs.

## Alternatives considered

**Rebase the 13 fork commits onto upstream instead of merging.** Rejected: the fork's commits are pushed; rewriting them forces a force-push and loses the shared-branch checkpoint that a merge commit preserves for later syncs.

**Cherry-pick only the prompt fix.** Rejected: the user asked to bring all upstream changes, and partial syncs leave the same rescope conflicts to re-solve at every later merge.

**Change CONTROLLED_PROMPT to the tool's private prompt (the published node_modules patch).** Rejected: coupling the backend contract to one consumer's constant breaks standalone PTY sessions, and patching node_modules is lost on the next install; upstream's PROMPT_COMMAND self-healing solves the same degradation without coupling.
## Consequences

The persistent-bash tool calls drop from ~7180/3560/3566 ms to ~355/88/91 ms (spawn+init+echo, echo, pwd; darwin, production defaults). All local gates pass: build (lib+web), unit tests, keyless snapshot replay, lint, doc-sync (28/28), hygiene, after bumping the fork-created web-identity package to the root version.

Three full-suite test flakes (oxlint-contract probes, acp-snapshot harness wait) pass in isolation; they are pre-existing load-sensitive subprocess/timing tests. The typert type-model snapshot is sensitive to the pnpm store layout (realpath of symlinked deps): it was re-recorded on this machine's global-store layout, and its committed path form already differed from upstream's CI layout before this merge.
