/** npm package-version integrity reads shared by publication and promotion. */

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { attempt } from './process.ts'

/** What the registry knows about one exact package version. */
export type RegistryState =
  | { readonly kind: 'absent' }
  | { readonly kind: 'present'; readonly integrity: string }

/**
 * Calculate the subresource integrity npm records for a tarball.
 * @param tarball - Absolute tarball path.
 * @returns A `sha512-<base64>` integrity string.
 */
export function integrityOf(tarball: string): string {
  return `sha512-${createHash('sha512').update(readFileSync(tarball)).digest('base64')}`
}

/**
 * Read one exact version from npm.
 * @param name - npm package name.
 * @param version - Exact package version.
 * @returns Whether the version exists and its recorded integrity.
 */
export function registryState(name: string, version: string): RegistryState {
  const result = attempt('npm', ['view', `${name}@${version}`, 'dist.integrity', '--json'])
  if (result.status !== 0) {
    const output = `${result.stdout}${result.stderr}`
    if (output.includes('E404') || output.includes('404 Not Found')) return { kind: 'absent' }
    throw new Error(`npm view ${name}@${version} failed:\n${output}`)
  }
  const parsed: unknown = JSON.parse(result.stdout)
  if (typeof parsed !== 'string' || parsed === '') {
    throw new Error(`registry reported no dist.integrity for ${name}@${version}`)
  }
  return { kind: 'present', integrity: parsed }
}

/**
 * Reject absent or byte-mismatched registry state before promotion.
 * @param state - Registry state for the candidate version.
 * @param local - Integrity of the packed promotion artifact.
 * @param name - npm package name.
 * @param version - Exact package version.
 */
export function assertPublishedIntegrity(
  state: RegistryState, local: string, name: string, version: string,
): void {
  if (state.kind === 'absent') throw new Error(`${name}@${version} is not published`)
  if (state.integrity !== local) {
    throw new Error(
      `${name}@${version} registry bytes differ from the promotion artifact`
      + `\n  registry: ${state.integrity}\n  packed:   ${local}`,
    )
  }
}

/**
 * Require npm to carry the exact packed bytes before a dist-tag can move.
 * @param tarball - Absolute tarball path.
 * @param name - npm package name.
 * @param version - Exact package version.
 */
export function verifyPublishedTarball(tarball: string, name: string, version: string): void {
  assertPublishedIntegrity(registryState(name, version), integrityOf(tarball), name, version)
}
