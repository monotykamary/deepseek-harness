/** CLI presentation for DSH distribution inventory and updates. */

import {
  checkInstalledDistribution, detectInstallChannel, installedDistribution, installationDiagnostics, launchDetachedUpdate,
} from '@monotykamary/dsh-distribution-update'
import { resolveDshHome } from '@monotykamary/dsh-home-paths'

export type DistributionAction = 'version' | 'doctor' | 'check' | 'update'

interface DistributionReport {
  readonly channel: ReturnType<typeof detectInstallChannel>
  readonly dshHome: string
  readonly node: string
  readonly packages: ReturnType<typeof installedDistribution>
}

type DoctorReport = DistributionReport & {
  readonly diagnostics: ReturnType<typeof installationDiagnostics>
}

function report(appManifest: string): DistributionReport {
  return {
    channel: detectInstallChannel(appManifest),
    dshHome: resolveDshHome(),
    node: process.version,
    packages: installedDistribution(appManifest),
  }
}

function printReport(value: DistributionReport | DoctorReport): void {
  process.stdout.write(`Install channel: ${value.channel}\n`)
  process.stdout.write(`Node: ${value.node}\n`)
  process.stdout.write(`DSH home: ${value.dshHome}\n`)
  for (const pkg of value.packages) process.stdout.write(`${pkg.name}: ${pkg.installed}\n`)
  if ('diagnostics' in value) {
    for (const diagnostic of value.diagnostics) {
      process.stdout.write(`[${diagnostic.severity}] ${diagnostic.summary}\n`)
      if (diagnostic.remediation !== null) process.stdout.write(`  ${diagnostic.remediation}\n`)
    }
  }
}

/**
 * Execute one distribution command.
 * @param action - launcher-owned distribution operation.
 * @param json - whether to emit machine-readable JSON.
 * @param appManifest - running DSH package manifest.
 * @param diagnose - host diagnostic sampler used only by doctor.
 * @returns the process exit code.
 */
export async function runDistribution(
  action: DistributionAction,
  json: boolean,
  appManifest: string,
  diagnose: typeof installationDiagnostics = installationDiagnostics,
): Promise<number> {
  if (action === 'version' || action === 'doctor') {
    const value: DistributionReport | DoctorReport = action === 'doctor'
      ? { ...report(appManifest), diagnostics: diagnose() }
      : report(appManifest)
    if (json) process.stdout.write(`${JSON.stringify(value, undefined, 2)}\n`)
    else printReport(value)
    return 'diagnostics' in value && value.diagnostics.some(item => item.severity === 'blocking') ? 2 : 0
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
