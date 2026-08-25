/** Install a staged dsh release from npm with the resolver settings users receive. */

import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { consumerEnvironment } from './consumer.ts'
import { attempt, capture, isEntry } from './process.ts'
import { releaseFamily } from './families.ts'
import { packedIdentity } from './tarball.ts'

/** A clean registry install may download the complete application dependency graph. */
const REGISTRY_INSTALL_TIMEOUT_MS = 20 * 60 * 1_000

/** Install the staged family entry by exact version and drive its executable. */
function main(): void {
  const { values } = parseArgs({
    options: { family: { type: 'string' }, from: { type: 'string' } },
    allowPositionals: false,
  })
  if (values.family === undefined || values.from === undefined) {
    throw new Error('usage: verify-registry-install.ts --family <dsh|vendor> --from <packed directory>')
  }

  const family = releaseFamily(values.family)
  const entry = family.installedEntry
  if (entry === undefined) throw new Error(`release family ${family.id} has no executable registry install to verify`)
  const packedDirectory = resolve(process.cwd(), values.from)
  const expected = readdirSync(packedDirectory)
    .filter(filename => filename.endsWith('.tgz'))
    .map(filename => packedIdentity(join(packedDirectory, filename)))
    .find(identity => identity.name === entry.packageName)
  if (expected === undefined) throw new Error(`${entry.packageName} is not among the packed tarballs`)

  const consumerRoot = mkdtempSync(join(tmpdir(), `dsh-registry-${family.id}-`))
  const prefix = join(consumerRoot, 'prefix')
  try {
    const environment = consumerEnvironment(consumerRoot)
    const result = attempt('npm', [
      'install', '--global', '--ignore-scripts', '--no-audit', '--no-fund', '--prefer-online',
      '--loglevel=warn', '--prefix', prefix, `${entry.packageName}@${expected.version}`,
    ], { cwd: consumerRoot, env: environment, timeoutMs: REGISTRY_INSTALL_TIMEOUT_MS })
    const output = `${result.stdout}${result.stderr}`
    if (result.status !== 0) {
      throw new Error(`standard npm registry install exited with ${String(result.status)}:\n${output}`)
    }
    if (output.includes('ERESOLVE')) throw new Error(`standard npm registry install reported peer overrides:\n${output}`)

    const bin = join(prefix, 'lib', 'node_modules', ...entry.packageName.split('/'), entry.binPath)
    const version = capture(process.execPath, [bin, '--version'], { cwd: consumerRoot, env: environment })
    if (version !== expected.version) {
      throw new Error(`registry-installed ${entry.packageName} reported ${JSON.stringify(version)}, expected ${expected.version}`)
    }
    console.log(`release verify-registry-install: ${entry.packageName}@${version} installed without peer overrides`)
  } finally {
    rmSync(consumerRoot, { recursive: true, force: true })
  }
}

if (isEntry(import.meta.url)) main()
