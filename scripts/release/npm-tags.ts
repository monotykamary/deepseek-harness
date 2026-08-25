/** npm dist-tag policy for staged and final release publication. */

import { compareVersions } from './bump.ts'

/** Dist-tag that exposes a candidate by exact version without moving a user-facing tag. */
export const RELEASE_CANDIDATE_TAG = 'release-candidate'

/**
 * Select the user-facing dist-tag for a verified version.
 * @param version - Semver version from the packed manifest.
 * @returns `next` for prereleases and `latest` for stable versions.
 */
export function finalDistTag(version: string): 'latest' | 'next' {
  return version.includes('-') ? 'next' : 'latest'
}

/**
 * Build npm publish arguments for staged or direct publication.
 * @param version - Semver version from the packed manifest.
 * @param staged - Whether publication must leave user-facing tags unchanged.
 * @returns npm CLI arguments selecting the publication tag.
 */
export function publicationTagArgs(version: string, staged: boolean): string[] {
  return ['--tag', staged ? RELEASE_CANDIDATE_TAG : finalDistTag(version)]
}

/**
 * Decide whether a dist-tag needs a forward update and reject rollback.
 * @param name - npm package name for diagnostics.
 * @param tag - User-facing dist-tag.
 * @param current - Version currently tagged, when present.
 * @param candidate - Verified version awaiting promotion.
 * @returns Whether npm must update the tag.
 */
export function promotionRequired(
  name: string,
  tag: string,
  current: string | undefined,
  candidate: string,
): boolean {
  if (current === candidate) return false
  if (current !== undefined && compareVersions(current, candidate) > 0) {
    throw new Error(`refusing to move ${name} ${tag} backward from ${current} to ${candidate}`)
  }
  return true
}
