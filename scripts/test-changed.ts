/**
 * Fast inner-loop gate: run vitest scoped to the packages the worktree
 * changed, instead of the whole suite. Answers "does my next edit hold?"
 * in seconds-to-minutes (add --coverage to enforce the aggregate 80% bar on
 * only the changed packages' src, minutes instead of the full hours-long
 * coverage gate). CI remains the exhaustive authority; this is a local
 * feedback tool, not a substitute for the full gates.
 *
 * Scope rules:
 * - packages/<group>/<pkg>/ and examples/<name>/ changes run that package.
 * - scripts and apps spec files (non-e2e) run the file itself.
 * - app e2e files are reported (the web lane owns them:
 *   DSH_SNAPSHOT=replay bun run test:web).
 * - Everything else (docs, notes, root configs) reports no test scope.
 *
 * Usage: bun run test:changed [-- --coverage] [--watch]
 */
import { spawnSync } from 'node:child_process'
import { parseArgs } from 'node:util'
import { resolve } from 'node:path'
import { bunInvocation } from './bun-invocation.ts'

const REPO_ROOT = resolve(import.meta.dirname, '..')

function gitLines(args: string[]): string[] {
  const result = spawnSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8' })
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`)
  return result.stdout.split('\n').filter(Boolean)
}

/** Map one changed path to its test scope; undefined means no unit scope. */
function scopeOf(path: string): string | undefined {
  const packageMatch = path.match(/^(packages\/[^/]+\/[^/]+)\/.*$/)
  if (packageMatch !== null) return packageMatch[1]
  const exampleMatch = path.match(/^(examples\/[^/]+)\/.*$/)
  if (exampleMatch !== null) return exampleMatch[1]
  if (path.endsWith('.spec.ts') || path.endsWith('.spec.tsx')) return path
  return undefined
}

const { values: options } = parseArgs({
  args: process.argv.slice(2),
  options: {
    watch: { type: 'boolean', default: false },
    coverage: { type: 'boolean', default: false },
  },
  allowPositionals: false,
})

const changed = [
  ...gitLines(['diff', '--name-only', 'HEAD']),
  ...gitLines(['ls-files', '--others', '--exclude-standard']),
]
const scopes = [...new Set(changed.map(scopeOf).filter((s): s is string => s !== undefined))]
const e2eFiles = changed.filter(path => path.endsWith('.e2e.ts'))

if (scopes.length === 0) {
  console.log('test:changed: no changed package, example, or spec file; nothing to run.')
  if (e2eFiles.length > 0) {
    console.log('  web e2e files changed — run the web lane: DSH_SNAPSHOT=replay bun run test:web')
  }
  process.exit(0)
}

console.log('test:changed: ' + scopes.join(', '))
if (e2eFiles.length > 0) {
  console.log('  (web e2e also changed — run DSH_SNAPSHOT=replay bun run test:web for those)')
}

const vitestArgs: string[] = ['x', 'vitest']
if (!options.watch) vitestArgs.push('run')
vitestArgs.push(...scopes)
if (options.coverage) {
  vitestArgs.push('--coverage')
  for (const scope of scopes) {
    // src-only include: the aggregate 80% threshold then gates exactly the
    // changed packages' runtime source, minutes instead of the full gate.
    if (scope.startsWith('packages/')) {
      vitestArgs.push('--coverage.include', scope + '/src/**/*.{ts,tsx}')
    }
  }
}

console.log('  $ bun ' + vitestArgs.join(' '))
const invocation = bunInvocation(vitestArgs)
const run = spawnSync(invocation.command, invocation.args, { cwd: REPO_ROOT, stdio: 'inherit' })
process.exit(run.status ?? 1)
