/** Enforce Lucide as the icon source for product-authored web UI. */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const LUCIDE_BARREL = 'packages/client/ui-primitives/src/icons/index.tsx'
const INLINE_SVG_EXEMPTIONS = new Set([
  'packages/client/ui-attachment/src/DropOverlay.tsx',
  'packages/client/ui-conversation/src/client/skeleton/ContextMeter.tsx',
  'packages/client/ui-conversation/src/client/skeleton/EmptyHero.tsx',
  'packages/client/ui-primitives/src/BrandWordmark.tsx',
  'packages/client/ui-primitives/src/FishLogo.tsx',
])
const LEGACY_ICON_RE = /\bIcon[A-Z][A-Za-z0-9_]*(?:12|14|16|20|8x10)\b/u

/**
 * Find icon-policy violations in one shipped source file.
 * @param repoPath - Repository-relative POSIX path.
 * @param source - File contents.
 * @returns Actionable violation messages.
 */
export function webIconViolations(repoPath: string, source: string): string[] {
  const failures: string[] = []
  if (repoPath !== LUCIDE_BARREL && /from ['"]lucide-react['"]/u.test(source)) {
    failures.push('import Lucide components from @monotykamary/dsh-client-ui-primitives')
  }
  if (LEGACY_ICON_RE.test(source)) failures.push('legacy ic_ds component name remains')
  if (source.includes('<svg') && !INLINE_SVG_EXEMPTIONS.has(repoPath)) {
    failures.push('inline SVG is not an approved logo, illustration, or data visualization; use a Lucide component')
  }
  return failures
}

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const webRoots = [
  join(repoRoot, 'packages', 'client'),
  join(repoRoot, 'packages', 'extensions'),
  join(repoRoot, 'packages', 'session-query'),
]

function walkSources(dir: string): string[] {
  const files: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) {
      if (entry !== 'lib' && entry !== 'node_modules' && entry !== 'tests') files.push(...walkSources(full))
    } else if ((entry.endsWith('.ts') || entry.endsWith('.tsx')) && full.includes(`${sep}src${sep}`)) {
      files.push(full)
    }
  }
  return files
}

const failures: string[] = []
for (const file of webRoots.flatMap(walkSources)) {
  const repoPath = relative(repoRoot, file).split(sep).join('/')
  for (const failure of webIconViolations(repoPath, readFileSync(file, 'utf8'))) {
    failures.push(`${repoPath}: ${failure}`)
  }
}
if (failures.length > 0) {
  for (const failure of failures) console.error(failure)
  process.exit(1)
}
console.log(`verify-web-icons: Lucide owns shipped UI icons; ${INLINE_SVG_EXEMPTIONS.size} non-icon SVG files are pinned`)
