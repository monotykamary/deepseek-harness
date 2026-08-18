/**
 * UI layout gate (root AGENTS.md "Conventions"): client CSS never declares
 * margins — an element changes only its own padding, and spacing between
 * siblings is the parent flex/grid track's gap — and never adds freestanding
 * z-index values outside the overlay layer, where paint order comes from DOM
 * order (overlays portal to the end of body, no numbered escalation):
 * https://danielrotter.at/2020/04/08/avoid-z-index-whenever-possible.html
 *
 * Existing debt is pinned per file in ui-layout-baseline.json: a file keeps at
 * most its pinned count of each construct, files absent from the pin must be
 * clean, and a pin entry whose debt drops is stale — the pin only shrinks.
 * After cleanup, rewrite the pin with --write-baseline; never to grow it.
 *
 * Scope is packages/client CSS sources. Tailwind margin utilities in tsx
 * class lists join this gate when the utility layer lands (m-*, space-* are
 * the utility spellings of the same banned construct).
 */

import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Per-file violation counts: margin declarations and z-index sites. */
export interface LayoutDebt {
  margins: number
  zindexes: number
}

/** Repo-relative path -> debt for every file carrying debt; the baseline pin shape. */
export type DebtMap = Record<string, LayoutDebt>

const MARGIN_RE = /\bmargin(?:-(?:top|right|bottom|left|block(?:-(?:start|end))?|inline(?:-(?:start|end))?))?\s*:/g
const ZINDEX_RE = /\bz-index\s*:/g
const COMMENT_RE = /\/\*[\s\S]*?\*\//g

/**
 * Count the two forbidden constructs in one CSS source. Comments are stripped
 * first, so guidance like "(z-index 7) above the composer" in a comment can
 * neither satisfy nor trip the gate.
 *
 * @param css - raw CSS file contents.
 * @returns violation counts; both zero for a clean file.
 */
export function scanSource(css: string): LayoutDebt {
  const code = css.replace(COMMENT_RE, ' ')
    // Overlay-tier references are the one permitted z-index: a value pinned
    // to a --dsw-layer-* token (theme-owned) instead of a local number.
    .replace(/z-index\s*:\s*var\(--dsw-layer-[a-z-]+\)/g, '')
  return {
    margins: [...code.matchAll(MARGIN_RE)].length,
    zindexes: [...code.matchAll(ZINDEX_RE)].length,
  }
}

/**
 * Compare the current debt map against the baseline pin.
 *
 * @param current - per-file debt from the live tree (only files carrying debt).
 * @param baseline - the pin; must cover current at equal or greater counts.
 * @returns one failure line per deviation; empty when the pin holds exactly.
 */
export function diffAgainstBaseline(current: DebtMap, baseline: DebtMap): string[] {
  const failures: string[] = []
  for (const [file, debt] of Object.entries(current)) {
    const pin = baseline[file]
    if (pin === undefined) {
      failures.push(`${file}: new violations outside the pin (${debt.margins} margin decl, ${debt.zindexes} z-index) — margins are forbidden (the parent gap owns sibling spacing) and z-index only lives in overlay-layer tokens`)
      continue
    }
    if (debt.margins > pin.margins) failures.push(`${file}: margin decls grew ${pin.margins} -> ${debt.margins} (the pin only shrinks)`)
    if (debt.zindexes > pin.zindexes) failures.push(`${file}: z-index sites grew ${pin.zindexes} -> ${debt.zindexes} (the pin only shrinks)`)
    if (debt.margins < pin.margins || debt.zindexes < pin.zindexes) {
      failures.push(`${file}: debt dropped below its pin — run pnpm run verify-ui-layout:baseline to shrink the baseline`)
    }
  }
  for (const file of Object.keys(baseline)) {
    if (!(file in current)) failures.push(`${file}: fully resolved — run pnpm run verify-ui-layout:baseline to drop the pin entry`)
  }
  return failures
}

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const baselinePath = join(repoRoot, 'scripts', 'ui-layout-baseline.json')
const clientRoot = join(repoRoot, 'packages', 'client')

function walkCss(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...walkCss(full))
    else if (entry.endsWith('.css')) out.push(full)
  }
  return out
}

function collectCurrent(): DebtMap {
  const debt: DebtMap = {}
  for (const pkg of readdirSync(clientRoot)) {
    const pkgDir = join(clientRoot, pkg)
    if (!statSync(pkgDir).isDirectory()) continue
    const src = join(pkgDir, 'src')
    try {
      if (!statSync(src).isDirectory()) continue
    } catch {
      continue
    }
    for (const file of walkCss(src)) {
      const found = scanSource(readFileSync(file, 'utf8'))
      if (found.margins > 0 || found.zindexes > 0) {
        debt[relative(repoRoot, file).split(sep).join('/')] = found
      }
    }
  }
  return debt
}

const current = collectCurrent()

if (process.argv.slice(2).includes('--write-baseline')) {
  const sorted = Object.fromEntries(Object.keys(current).sort().map(key => [key, current[key]]))
  writeFileSync(baselinePath, JSON.stringify(sorted, null, 2) + '\n')
  console.log(`verify-ui-layout: baseline rewritten pinning ${Object.keys(sorted).length} files`)
} else {
  const baseline = JSON.parse(readFileSync(baselinePath, 'utf8')) as DebtMap
  const failures = diffAgainstBaseline(current, baseline)
  if (failures.length > 0) {
    for (const failure of failures) console.error(failure)
    process.exit(1)
  }
  console.log(`verify-ui-layout: ${Object.keys(current).length} pinned files hold their debt`)
}
