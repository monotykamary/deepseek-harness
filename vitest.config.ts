import { spawnSync } from 'node:child_process'
import tsconfigPaths from 'vite-tsconfig-paths'
import { resolvePwshPath } from './packages/shell/pwsh-local/src/resolve.ts'
import { defineConfig } from 'vitest/config'
import { standardDecoratorPlugin, vitestExecArgv } from './vitest.shared.ts'
import { COVERAGE_EXEMPT_ENV, coverageExemptHeavySuites } from './scripts/coverage-exempt.ts'
import { COVERAGE_PARTITION_MODE_ENV } from './scripts/coverage-partitions.ts'

// Resolution facade shared by every plugin instance below: tsconfig.base.json
// has no include, which vite-tsconfig-paths treats as match-all, so its paths
// map applies to every test file. paths must win over package exports so built
// lib/ never loads a second module-singleton copy.
const pathsPlugin = (): ReturnType<typeof tsconfigPaths> => tsconfigPaths({ projects: ['./tsconfig.base.json'] })

const windowsUnsupportedPackages = process.platform === 'win32'
  ? [
      // Bash-requiring suites (a real POSIX shell is unavailable on Windows).
      // The pwsh-requiring suites (pwsh-local, tool-pwsh) deliberately stay
      // INCLUDED: PowerShell ships with Windows, so they run natively here.
      // This explicit list (not a 'packages/shell/*' glob) keeps
      // packages/shell/shell — the Service Definition package — running on Windows.
      'packages/shell/bash-local',
      'packages/shell/bash-sandbox',
      'packages/shell/tool-bash',
      'packages/hooks/*',
      'packages/terminal/terminal-bash',
      'packages/sandbox/sandbox-local',
    ]
  : []

const windowsUnsupportedTests = process.platform === 'win32'
  ? [
      ...windowsUnsupportedPackages.map(path => `${path}/tests/**/*.spec.ts`),
      'packages/subprocess/subprocess/tests/**/*.spec.ts',
      'packages/subprocess/subprocess-local/tests/local.spec.ts',
      'packages/subprocess/subprocess-local/tests/process-inspector.spec.ts',
      'packages/subprocess/subprocess-local/tests/spawn.spec.ts',
      'packages/subprocess/subprocess-local/tests/terminal.spec.ts',
    ]
  : []

const windowsUnsupportedCoveragePackages = process.platform === 'win32'
  ? [...windowsUnsupportedPackages, 'packages/subprocess/*']
  : []

// Windows-only packages: their sources execute exclusively on win32 (koffi
// loads Win32 libraries), so the Linux coverage lane can never cover them.
// The Windows dev/CI lane exercises them through the probe/runner suites; the
// aggregate coverage must not count source that cannot execute on this host.
const windowsOnlyCoverageExclusions = process.platform !== 'win32'
  ? [
      'packages/sandbox/sandbox-windows-acl/src/**/*.ts',
      // The koffi-backed Win32 table (Toolhelp32/GetProcessTimes/taskkill)
      // executes only on win32; its decision logic is unit-pinned on every
      // host through the injected-internals suites.
      'packages/subprocess/subprocess-local/src/windows-inspector.ts',
    ]
  : []

// The confinement runner entry executes exclusively as a spawned child
// process (the sandbox seam's argv-prefix wrapper): its module-level main()
// would run the confinement in-process if imported, and vitest's v8 coverage
// never measures child processes. Its behavior is pinned end-to-end by
// tests/runner.spec.ts, which spawns the real entry through tsx.
const windowsRunnerCoverageExclusions = process.platform === 'win32'
  ? ['packages/sandbox/sandbox-windows-acl/src/runner.ts']
  : []

// pwsh-local's run/start/lifecycle suites self-skip without a real pwsh
// (executor.spec.ts hasPwsh), leaving this file
// unexecuted on pwsh-less hosts; the exemption keeps those hosts comparable
// while CI runners exercise the implementation with real PowerShell. The probe
// runs the suites' own resolution (the dependency-free resolve.ts module),
// so the exemption is active exactly when the suites skip — a mismatched
// narrower probe could exempt the file on hosts whose suites actually run.
const pwshCoverageExclusions = spawnSync(resolvePwshPath(), ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', '$true'], { encoding: 'utf8' }).status === 0
  ? []
  : [
      'packages/shell/pwsh-local/src/index.ts',
      'packages/shell/pwsh-sandbox/src/**/*.ts',
    ]

const testIncludes = [
  'packages/*/*/tests/**/*.spec.{ts,tsx}',
  'apps/*/tests/**/*.spec.ts',
  'examples/*/tests/**/*.spec.ts',
  'scripts/**/*.spec.ts',
]

const observationalTests = [
  'packages/*/*/tests/**/*.observational.spec.{ts,tsx}',
  'apps/*/tests/**/*.observational.spec.ts',
  'scripts/**/*.observational.spec.ts',
]

// The instrumented coverage gate sets this env; the exempt heavy suites then
// run beside it uninstrumented (membership contract in scripts/coverage-exempt.ts).
// A set-but-not-'1' value is a misconfiguration, not a silent no-op.
const coverageExemptRaw = process.env[COVERAGE_EXEMPT_ENV]
if (coverageExemptRaw !== undefined && coverageExemptRaw !== '' && coverageExemptRaw !== '1') {
  throw new Error(`vitest config: ${COVERAGE_EXEMPT_ENV} must be '1' or unset, got ${JSON.stringify(coverageExemptRaw)}.`)
}
const coverageExemptExcludes = coverageExemptRaw === '1'
  ? coverageExemptHeavySuites.map(suite => suite.exclude)
  : []

const coveragePartitionRaw = process.env[COVERAGE_PARTITION_MODE_ENV]
if (coveragePartitionRaw !== undefined && coveragePartitionRaw !== '' && coveragePartitionRaw !== '1') {
  throw new Error(`vitest config: ${COVERAGE_PARTITION_MODE_ENV} must be '1' or unset, got ${JSON.stringify(coveragePartitionRaw)}.`)
}
const coveragePartitionMode = coveragePartitionRaw === '1'

// These suites exercise process-global state, process APIs, or timing-sensitive process I/O
// that worker threads cannot isolate reliably under aggregate gate contention.
// Keep the narrow exception in forks while the rest of the inventory avoids per-file processes.
const processBoundTests = [
  'packages/session/session-persistence-jsonl/tests/jsonl.spec.ts',
  'packages/subagent/subagent-acp/tests/subagent-acp.spec.ts',
  'packages/subprocess/subprocess-local/tests/process-exit.spec.ts',
  'packages/subprocess/subprocess-local/tests/spawn.spec.ts',
  'packages/context/time-context/tests/time-context.spec.ts',
  'packages/llm/llm-pi-ai/tests/adapter.spec.ts',
  'packages/boot/app-boot/tests/app-boot.spec.ts',
  'packages/workflow/workflow-worker-thread/tests/session.spec.ts',
]

export default defineConfig({
  plugins: [pathsPlugin(), standardDecoratorPlugin()],
  test: {
    setupFiles: ['./scripts/test-invariants.ts'],
    // .tsx: client component specs (jsdom via per-file @vitest-environment pragma).
    include: testIncludes,
    exclude: [...windowsUnsupportedTests, ...observationalTests],
    // One coverage invocation aggregates both projects. Every suite forks for
    // Node stability; process-bound suites stay separate for inventory control.
    projects: [
      {
        plugins: [pathsPlugin(), standardDecoratorPlugin()],
        test: {
          name: 'thread-safe',
          execArgv: vitestExecArgv,
          // Node 24 has aborted in its CJS lexer (v8::ToLocalChecked Empty
          // MaybeLocal in cjs_lexer::Parse) from worker threads on macOS,
          // Linux, and Windows. Forked workers avoid that shared thread path.
          pool: 'forks',
          setupFiles: ['./scripts/test-invariants.ts'],
          include: testIncludes,
          exclude: [
            ...windowsUnsupportedTests,
            ...observationalTests,
            ...processBoundTests,
            ...coverageExemptExcludes,
          ],
        },
      },
      {
        plugins: [pathsPlugin(), standardDecoratorPlugin()],
        test: {
          name: 'process-bound',
          execArgv: vitestExecArgv,
          pool: 'forks',
          setupFiles: ['./scripts/test-invariants.ts'],
          include: processBoundTests,
          exclude: [
            ...windowsUnsupportedTests,
            ...observationalTests,
            ...coverageExemptExcludes,
          ],
        },
      },
    ],
    coverage: {
      provider: 'v8',
      // Coverage measures OUR runtime source. Types-only files carry no
      // executable code; vendor/ and examples/ are out of scope (examples are
      // exercised by the demo smoke test instead).
      // .tsx: client components are gated like everything else (jsdom lane).
      include: ['packages/*/*/src/**/*.{ts,tsx}'],
      // Types and self-executing entries do not have an in-process unit-test path.
      exclude: [
        'packages/*/*/src/types.ts',
        'packages/*/*/src/bin.ts',
        'packages/*/*/src/worker.ts',
        'packages/*/*/src/oxlint-contract-*.ts',
        // Generated Host-for-Client entries exist only after the Host build.
        'packages/api/remotes/src/index.ts',
        'packages/api/remotes/src/client/index.ts',
        // Generator correctness runs uninstrumented because TypeScript whole-workspace analysis dominates coverage time.
        'packages/typert/generator/src/*.ts',
        ...windowsUnsupportedCoveragePackages.map(path => `${path}/src/**/*.ts`),
        ...windowsOnlyCoverageExclusions,
        ...windowsRunnerCoverageExclusions,
        ...pwshCoverageExclusions,
      ],
      // Coverage is one readiness input, not a proof of behavior. The aggregate
      // threshold measures the repository honestly without suppression comments.
      thresholds: coveragePartitionMode
        ? undefined
        : {
            statements: 80,
            branches: 80,
            functions: 80,
            lines: 80,
          },
      reporter: coveragePartitionMode
        ? []
        : process.env.CI
          ? ['text']
          : ['text', 'html'],
    },
  },
})
