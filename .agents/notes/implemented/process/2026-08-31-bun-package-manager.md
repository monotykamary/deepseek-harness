# Agent Note: Bun as the sole repository package manager

Status: implemented

English | [中文](2026-08-31-bun-package-manager.zh.md)

## Problem

The repository's package-manager surface had spread across workspace discovery, dependency linking, lifecycle-script trust, CI provisioning and caching, release packing, generated consumer fixtures, Python runtime assembly, local Git hooks, and hundreds of contributor commands. Keeping pnpm for that surface while external DSH projects standardized on Bun would leave two lock formats and two command dialects in one development graph. A textual command swap alone was unsafe: Bun's workspace filters, executable re-entry, isolated linker, trusted lifecycle scripts, and `pm pack` working-directory rules differ from pnpm's.

The old lock also contained relative `link:` records that Bun 1.4 cannot migrate. Resolving every semver range afresh can change runtime behavior even when manifests do not change; Zod's recursive lazy-schema behavior demonstrated that risk. The migration therefore needed native Bun ownership plus behavioral verification, not a compatibility alias around the old manager.

This decision supersedes the historical [pnpm-over-Yarn decision](../../archived/process/2026-06-16-pnpm-over-yarn.md), [pnpm CI provisioning decision](../../archived/process/2026-07-26-pnpm-action-setup-for-symmetric-ci-caching.md), and [pnpm runner-isolation fix](../../archived/bug-fix/2026-07-29-pnpm-setup-runner-isolation.md).

## Decision

Bun 1.4.0 is the sole repository package manager and is pinned by the root `packageManager` field. `package.json` owns the complete workspace globs, `bun.lock` is the only active package-manager lock, and every reproducible install uses `bun install --frozen-lockfile`. Root and website manifests declare the Bun engine alongside the Node runtime engine.

`bunfig.toml` selects Bun's `isolated` linker so undeclared phantom imports continue to fail rather than being satisfied by a flat dependency tree. `trustedDependencies` is the explicit install-script allowlist. Same-wave DSH bundles, native loader packages, and selected browser packages appear in `minimumReleaseAgeExcludes`; that list bypasses only an ambient minimum-age policy and does not weaken lockfile integrity. Workspace references continue to use `workspace:` so `bun pm pack` substitutes the member's actual published version.

Bun could not import the old lock because its relative `link:` entries are unsupported. The repository therefore owns a fresh native lock and treats the full deterministic gate inventory as the migration proof. Compatibility-sensitive resolutions are explicit: root `overrides` holds Zod at 4.4.3, Vitest and its coverage companion at 4.1.11, and Vitest's Vite child at 8.2.2; root development dependencies retain Knip 6.16.1 and tsdown 0.22.2 while application Vite remains 6.4.3. Zod stays pinned until the recursive schema-emitter test passes on a newer release, the current Vitest module runner supports the repository's dynamic `import.meta.resolve` contracts, and the analyzer/build pins preserve pre-migration behavior. A dependency update is a separate reviewed change, not an incidental result of changing package managers.

All scripts, hooks, workflows, release tools, docs, and generated fixtures invoke Bun directly. GitHub Actions provisions it with `oven-sh/setup-bun`; no Corepack or package-manager-specific Node cache action is required. Code that recursively launches the active package manager uses [`scripts/bun-invocation.ts`](../../../../scripts/bun-invocation.ts), reads Bun's `npm_execpath`, and returns a command/argument vector for shell-free spawning. A JavaScript launcher is re-entered through Node; a native Bun executable is spawned directly. Missing lifecycle identity fails loud instead of guessing from `PATH`.

`bun pm pack` runs with the child process's `cwd`; scripts do not pass an unsupported package-manager `--cwd` flag. Local profile installers use absolute `file:` dependencies because Bun does not support the old relative-link workflow. The Cordis Loader's internal-module bridge resolves its optional platform binding from the wrapper package's own dependency scope when Bun isolation keeps that binding out of the helper's lexical scope. Native and external package compatibility code may still recognize historical npm or pnpm installation paths, but no repository build, test, documentation, or release task requires those managers.

Vitest workers receive `--expose-internals` directly through shared `execArgv`, preserving Cordis Loader and HMR tests without leaking `NODE_OPTIONS` into subprocesses. The same vector retains the conditional `--no-webstorage` isolation owned by the [Web Storage test decision](../testing/2026-07-30-vitest-jsdom-webstorage-ownership.md).

## Verification

The Bun-only invocation test rejects active pnpm commands and validates native and JavaScript Bun launchers. Workflow contract tests pin Bun setup, frozen installs, cache behavior, pack syntax, and generated-project commands. Workspace constraints, documentation synchronization, type checking, lint, unit and snapshot suites, client builds, native release packing, package payload checks, and consumer installs exercise the migrated paths. `bun install --frozen-lockfile` is a direct lock reproducibility probe.

## Alternatives considered

**Keep pnpm in the Harness and use Bun only in external plugins.** Rejected because local source linking, CI reproduction, and release testing would cross two lock graphs and preserve the exact split this migration removes.

**Retain pnpm aliases that forward to Bun.** Rejected because aliases hide stale automation, preserve invalid command semantics such as `dlx` and `--filter ... exec`, and make failures depend on shell configuration.

**Use Bun's hoisted linker for a smaller migration.** Rejected because a flat tree can satisfy undeclared dependencies and would discard the strict dependency-ownership guarantee preserved from the previous workspace.

**Set `NODE_OPTIONS` globally for Loader tests.** Rejected because it propagates test-runner policy into every spawned process. Vitest's worker `execArgv` scopes the requirement to the processes that need it.

**Accept every newly resolved semver version without targeted comparison.** Rejected after the Zod regression showed that a package-manager migration can silently become a dependency upgrade. Behavioral failures require an explicit pin or a separate compatible code change.

## Consequences

Contributors and automation need Bun 1.4.0 and use one command vocabulary, one workspace model, and one lockfile. CI no longer has a shared package-manager installation directory whose replacement can race across self-hosted runners. Shell-free re-entry works with Bun's native executable and remains testable as a pure command-vector decision.

The native lock is not byte-for-byte derived from the old pnpm graph, so the migration carries a large dependency diff and must be judged by exact pins plus the complete gate inventory. Isolated linking can expose missing declarations that a hoisted install concealed. Trusted dependency and minimum-age lists require maintenance when adding native or same-wave packages. Historical pnpm notes remain sealed in the archive, while active instructions and tooling have Bun authority.
