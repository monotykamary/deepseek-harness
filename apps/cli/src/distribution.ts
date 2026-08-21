/** CLI presentation for DSH distribution inventory and updates. */

import {
  checkInstalledDistribution, detectInstallChannel, installedDistribution, launchDetachedUpdate,
} from '@monotykamary/dsh-distribution-update'
import { resolveDshHome } from '@monotykamary/dsh-home-paths'

export type DistributionAction = 'version' | 'doctor' | 'check' | 'update'

interface DistributionReport {
  readonly channel: ReturnType<typeof detectInstallChannel>
  readonly dshHome: string
  readonly node: string
  readonly packages: ReturnType<typeof installedDistribution>
}

function report(appManifest: string): DistributionReport {
  return {
    channel: detectInstallChannel(appManifest),
    dshHome: resolveDshHome(),
    node: process.version,
    packages: installedDistribution(appManifest),
  }
}

function printReport(value: DistributionReport): void {
  process.stdout.write(`Install channel: ${value.channel}\n`)
  process.stdout.write(`Node: ${value.node}\n`)
  process.stdout.write(`DSH home: ${value.dshHome}\n`)
  for (const pkg of value.packages) process.stdout.write(`${pkg.name}: ${pkg.installed}\n`)
}

/** Execute one distribution command and return its process exit code. */
export async function runDistribution(action: DistributionAction, json: boolean, appManifest: string): Promise<number> {
  if (action === 'version' || action === 'doctor') {
    const value = report(appManifest)
    if (json) process.stdout.write(`${JSON.stringify(value, undefined, 2)}\n`)
    else printReport(value)
    return 0
  }
  if (action === 'check') {
    try {
      const packages = await checkInstalledDistribution(appManifest)
      const value = { ...report(appManifest), packages }
      if (json) process.stdout.write(`${JSON.stringify(value, undefined, 2)}\n`)
      else {
        printReport(value)
        process.stdout.write(packages.some(pkg => pkg.updateAvailable) ? 'Updates are available.\n' : 'DSH is up to date.\n')
      }
      return packages.some(pkg => pkg.updateAvailable) ? 10 : 0
    } catch (error) {
      process.stderr.write(`dsh: update check failed: ${error instanceof Error ? error.message : String(error)}\n`)
      return 1
    }
  }
  const result = launchDetachedUpdate(appManifest)
  if (json) process.stdout.write(`${JSON.stringify(result, undefined, 2)}\n`)
  else process.stdout.write(`${result.message}\n`)
  return result.started ? 0 : 2
}
