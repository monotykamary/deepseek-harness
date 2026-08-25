/**
 * Publish one packed release family from the tarballs the pack step produced.
 *
 * Publication is decided per package against the registry, never from a list of
 * "what this release includes": a version the registry lacks is published, a
 * version whose published tarball has the same integrity is skipped, and a
 * version whose published tarball differs fails the run — that last case means
 * the content changed without a version bump
 * ([rationale](../../.agents/notes/implemented/process/2026-08-10-npm-release-sequences.md)).
 *
 * Skipping on identical integrity is what makes re-running the publish step over
 * the same artifact safe.
 */

import { join, resolve } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { parseArgs } from 'node:util'
import { integrityOf, registryState } from './npm-package.ts'
import { publicationTagArgs } from './npm-tags.ts'
import { isTransientNpmWriteFailure, NPM_WRITE_ATTEMPTS, NPM_WRITE_SPACING_MS } from './npm-write.ts'
import { releaseFamily } from './families.ts'
import { attemptEchoed, isEntry } from './process.ts'
import { packedIdentity, readPublishOrder } from './tarball.ts'

/**
 * Publish one tarball, retrying a registry write that did not settle.
 *
 * Every retry re-reads the registry first, because `E409` can answer a write
 * that landed anyway: republishing a version that now exists fails permanently,
 * so the same integrity appearing under the failed attempt counts as success.
 * @param tarball - absolute tarball path.
 * @param name - package name the tarball declares.
 * @param version - package version the tarball declares.
 * @param staged - whether to leave user-facing dist-tags unchanged.
 */
async function publishTarball(tarball: string, name: string, version: string, staged: boolean): Promise<void> {
  const tagArgs = publicationTagArgs(version, staged)
  for (let tries = 1; tries <= NPM_WRITE_ATTEMPTS; tries += 1) {
    // No --access: the sequences do not share one access level, so a
    // command-line flag could not serve both and would override the manifest
    // that does. Each packed manifest decides, and
    // check-workspace-constraints holds every manifest to its sequence's level.
    const result = attemptEchoed('npm', ['publish', tarball, ...tagArgs])
    const output = `${result.stdout}${result.stderr}`
    if (result.status === 0) return

    const settled = registryState(name, version)
    if (settled.kind === 'present' && settled.integrity === integrityOf(tarball)) {
      console.log(`release publish: ${name}@${version} landed despite a reported failure, continuing`)
      return
    }
    if (tries === NPM_WRITE_ATTEMPTS || !isTransientNpmWriteFailure(output)) {
      throw new Error(`npm publish ${name}@${version} failed:\n${output}`)
    }
    const backoff = NPM_WRITE_SPACING_MS * 2 ** (tries - 1)
    console.log(
      `release publish: ${name}@${version} hit a transient registry failure`
      + ` (attempt ${String(tries)} of ${String(NPM_WRITE_ATTEMPTS)}), retrying in ${String(backoff)}ms`,
    )
    await sleep(backoff)
  }
}

/** Publish the family named by `--family` from the directory named by `--from`. */
async function main(): Promise<void> {
  const { values } = parseArgs({
    options: { family: { type: 'string' }, from: { type: 'string' }, stage: { type: 'boolean' } },
    allowPositionals: false,
  })
  if (values.family === undefined || values.from === undefined) {
    throw new Error('usage: publish.ts --family <dsh|vendor> --from <packed directory> [--stage]')
  }

  const family = releaseFamily(values.family)
  const directory = resolve(process.cwd(), values.from)

  // Every entry in the order settles as either published or already present, so
  // one counter answers "how far along is this run" for whoever is watching a
  // release that takes minutes per family.
  const order = readPublishOrder(directory)
  const total = String(order.length)
  let published = 0
  let skipped = 0
  for (const [index, filename] of order.entries()) {
    const progress = `[${String(index + 1)}/${total}]`
    const tarball = join(directory, filename)
    const { name, version } = packedIdentity(tarball)
    const state = registryState(name, version)
    if (state.kind === 'present') {
      const local = integrityOf(tarball)
      if (state.integrity !== local) {
        throw new Error(
          `${name}@${version} is already published with different content`
          + `\n  registry: ${state.integrity}\n  packed:   ${local}`
          + '\nBump the version, or investigate why the build is not reproducible.',
        )
      }
      console.log(`release publish: ${progress} ${name}@${version} already published, skipping`)
      skipped += 1
      continue
    }
    // Space out the writes: the gap belongs between publishes, so a run that
    // only skips does not wait at all.
    if (published > 0) await sleep(NPM_WRITE_SPACING_MS)
    await publishTarball(tarball, name, version, values.stage ?? false)
    console.log(`release publish: ${progress} ${name}@${version} published`)
    published += 1
  }

  console.log(
    `release publish: family ${family.id}, ${total} member(s),`
    + ` ${String(published)} published, ${String(skipped)} already present`
    + (values.stage === true ? ' under the release-candidate tag' : ''),
  )
}

if (isEntry(import.meta.url)) await main()
