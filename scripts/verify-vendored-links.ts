/**
 * Verify that bun.lock resolves every vendored package name to its workspace
 * source and never to a registry copy. A registry copy of a vendored identity
 * silently forks the framework layer described in vendor/README.md.
 */
import { readdir, readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')

async function vendoredPackages(): Promise<Map<string, string>> {
  const packages = new Map<string, string>()
  for (const entry of await readdir(join(root, 'vendor'), { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    let manifest: { name?: string }
    try {
      manifest = JSON.parse(await readFile(join(root, 'vendor', entry.name, 'package.json'), 'utf8')) as { name?: string }
    } catch {
      continue
    }
    if (manifest.name !== undefined) packages.set(manifest.name, `vendor/${entry.name}`)
  }
  return packages
}

interface LockedPackage {
  readonly key: string
  readonly descriptor: string
}

/** Read package-map rows from Bun's JSONC lockfile without accepting unrelated object fields. */
export function lockedPackages(text: string): LockedPackage[] {
  const rows: LockedPackage[] = []
  const row = /^\s{4}("(?:[^"\\]|\\.)+"):\s*\[\s*("(?:[^"\\]|\\.)+")/gmu
  for (const match of text.matchAll(row)) {
    const keyToken = match[1]
    const descriptorToken = match[2]
    if (keyToken === undefined || descriptorToken === undefined) continue
    const key: unknown = JSON.parse(keyToken)
    const descriptor: unknown = JSON.parse(descriptorToken)
    if (typeof key === 'string' && typeof descriptor === 'string') rows.push({ key, descriptor })
  }
  return rows
}

const vendored = await vendoredPackages()
if (vendored.size === 0) throw new Error('verify-vendored-links: no vendored package manifests found under vendor/')
const packages = lockedPackages(await readFile(join(root, 'bun.lock'), 'utf8'))
if (packages.length === 0) throw new Error('verify-vendored-links: bun.lock contains no package map entries')

const violations: string[] = []
for (const [name, directory] of vendored) {
  const matches = packages.filter(entry => entry.descriptor.startsWith(`${name}@`))
  if (matches.length === 0) {
    violations.push(`${name} has no bun.lock package entry`)
    continue
  }
  const expected = `${name}@workspace:${directory}`
  for (const entry of matches) {
    if (entry.descriptor !== expected) {
      violations.push(`${entry.key} resolves to ${JSON.stringify(entry.descriptor)} (expected ${JSON.stringify(expected)})`)
    }
  }
}

if (violations.length > 0) {
  console.error(`verify-vendored-links: ${String(violations.length)} lockfile resolution(s) bypass the vendored workspaces:`)
  for (const violation of violations) console.error(`  - ${violation}`)
  process.exit(1)
}
console.log(`verify-vendored-links: all ${String(vendored.size)} vendored package names resolve to Bun workspace sources.`)
