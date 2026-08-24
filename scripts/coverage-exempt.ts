/**
 * Slow correctness suites that run beside coverage without v8 instrumentation.
 * Their pass/fail result remains required; aggregate coverage measures the fast
 * instrumented inventory independently at the repository threshold.
 */

/** One uninstrumented suite: a Vitest CLI filter and its required-run exclude glob. */
export interface CoverageExemptSuite {
  /** Positional file filter selecting the suite in the uninstrumented run. */
  readonly filter: string
  /** Exclude glob removing the suite from the instrumented run. */
  readonly exclude: string
}

/**
 * Set to `1` by the instrumented coverage run; vitest.config.ts then drops
 * the uninstrumented suites from every project. CLI `--exclude` cannot express
 * this because it does not reach per-project include resolution.
 */
export const COVERAGE_EXEMPT_ENV = 'DSH_COVERAGE_EXEMPT_HEAVY'

/** Slow suites that retain blocking correctness without coverage instrumentation. */
export const coverageExemptHeavySuites: readonly CoverageExemptSuite[] = [
  { filter: 'packages/typert/generator/tests/', exclude: 'packages/typert/generator/tests/**' },
  { filter: 'packages/code-runtime/code-runtime-worker-thread/tests/runtime.spec.ts', exclude: 'packages/code-runtime/code-runtime-worker-thread/tests/runtime.spec.ts' },
  { filter: 'packages/workflow/workflow-worker-thread/tests/workflow-worker-thread.spec.ts', exclude: 'packages/workflow/workflow-worker-thread/tests/workflow-worker-thread.spec.ts' },
  { filter: 'packages/subagent/subagent-codex/tests/real-product.spec.ts', exclude: 'packages/subagent/subagent-codex/tests/real-product.spec.ts' },
  { filter: 'packages/subagent/subagent-claude-code/tests/real-product.spec.ts', exclude: 'packages/subagent/subagent-claude-code/tests/real-product.spec.ts' },
  { filter: 'packages/test-support/acp-snapshot/tests/harness.spec.ts', exclude: 'packages/test-support/acp-snapshot/tests/harness.spec.ts' },
  { filter: 'packages/session/session-persistence-sqlite/tests/differential.spec.ts', exclude: 'packages/session/session-persistence-sqlite/tests/differential.spec.ts' },
  { filter: 'packages/client/ui-primitives/tests/markdown-incremental.client.spec.tsx', exclude: 'packages/client/ui-primitives/tests/markdown-incremental.client.spec.tsx' },
  { filter: 'packages/client/ui-directory-picker-browse/tests/directory-browser.client.spec.tsx', exclude: 'packages/client/ui-directory-picker-browse/tests/directory-browser.client.spec.tsx' },
  { filter: 'packages/subagent/subagent-acp/tests/subagent-acp.spec.ts', exclude: 'packages/subagent/subagent-acp/tests/subagent-acp.spec.ts' },
  { filter: 'packages/subagent/subagent/tests/continuation.spec.ts', exclude: 'packages/subagent/subagent/tests/continuation.spec.ts' },
  { filter: 'packages/terminal/terminal-bash/tests/local.spec.ts', exclude: 'packages/terminal/terminal-bash/tests/local.spec.ts' },
  { filter: 'packages/subagent/subagent/tests/list-children.spec.ts', exclude: 'packages/subagent/subagent/tests/list-children.spec.ts' },
  { filter: 'scripts/', exclude: 'scripts/**/*.spec.ts' },
]
