/** Promote a staged npm release only after its registry install has passed. */

import { join, resolve } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { parseArgs } from 'node:util'
import { releaseFamily } from './families.ts'
import { verifyPublishedTarball } from './npm-package.ts'
import { finalDistTag, promotionRequired } from './npm-tags.ts'
import { isTransientNpmWriteFailure, NPM_WRITE_ATTEMPTS, NPM_WRITE_SPACING_MS } from './npm-write.ts'
import { attemptEchoed, capture, isEntry } from './process.ts'
import { packedIdentity, readPublishOrder } from './tarball.ts'

/**
 * Read one package's current dist-tag target.
 * @param name - npm package name.
 * @param tag - Dist-tag to inspect.
 * @returns Tagged version, or undefined when the tag is absent.
 */
function taggedVersion(name: string, tag: string): string | undefined {
  const prefix = `${tag}: `
  const line = capture('npm', ['dist-tag', 'ls', name]).split('\n').find(entry => entry.startsWith(prefix))
  return line?.slice(prefix.length)
}

/**
 * Point one user-facing dist-tag at a verified package version.
 * @param name - npm package name.
 * @param version - Published version to promote.
 */
async function promote(name: string, version: string): Promise<void> {
  const tag = finalDistTag(version)
  const current = taggedVersion(name, tag)
  if (!promotionRequired(name, tag, current, version)) return
  for (let tries = 1; tries <= NPM_WRITE_ATTEMPTS; tries += 1) {
    const result = attemptEchoed('npm', ['dist-tag', 'add', `${name}@${version}`, tag])
    const output = `${result.stdout}${result.stderr}`
    if (result.status === 0 || taggedVersion(name, tag) === version) return
    if (tries === NPM_WRITE_ATTEMPTS || !isTransientNpmWriteFailure(output)) {
      throw new Error(`npm dist-tag add ${name}@${version} ${tag} failed:\n${output}`)
    }
    const backoff = NPM_WRITE_SPACING_MS * 2 ** (tries - 1)
    console.log(`release promote: ${name}@${version} hit a transient registry failure, retrying in ${String(backoff)}ms`)
    await sleep(backoff)
  }
}

/** Promote every packed package in dependency-first publication order. */
async function main(): Promise<void> {
  const { values } = parseArgs({
    options: { family: { type: 'string' }, from: { type: 'string' } },
    allowPositionals: false,
  })
  if (values.family === undefined || values.from === undefined) {
    throw new Error('usage: promote.ts --family <dsh|vendor> --from <packed directory>')
  }

  const family = releaseFamily(values.family)
  const directory = resolve(process.cwd(), values.from)
  const order = readPublishOrder(directory)
  for (const [index, filename] of order.entries()) {
    const tarball = join(directory, filename)
    const { name, version } = packedIdentity(tarball)
    verifyPublishedTarball(tarball, name, version)
    await promote(name, version)
    console.log(`release promote: [${String(index + 1)}/${String(order.length)}] ${name}@${version} -> ${finalDistTag(version)}`)
    if (index + 1 < order.length) await sleep(NPM_WRITE_SPACING_MS)
  }
  console.log(`release promote: family ${family.id}, ${String(order.length)} member(s) promoted`)
}

if (isEntry(import.meta.url)) await main()
