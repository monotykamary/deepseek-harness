/** Experimental-package publication and dependency constraints. */

import { describe, expect, it } from 'vitest'
import {
  checkExperimentalDependencyIsolation,
  checkExperimentalManifest,
  type WorkspaceManifest,
} from './check-workspace-constraints.ts'

const experimental: WorkspaceManifest = {
  dir: 'packages/experimental/prototype',
  manifest: { name: '@monotykamary/dsh-experimental-prototype', private: true },
}

describe('experimental workspace constraints', () => {
  it('requires the experimental package-name prefix', () => {
    expect(checkExperimentalManifest({
      ...experimental,
      manifest: { ...experimental.manifest, name: '@monotykamary/dsh-prototype' },
    })).toEqual([
      '@monotykamary/dsh-prototype: experimental package name must start with "@monotykamary/dsh-experimental-"',
    ])
  })

  it('requires private manifests without publication metadata', () => {
    expect(checkExperimentalManifest(experimental)).toEqual([])
    expect(checkExperimentalManifest({
      ...experimental,
      manifest: { ...experimental.manifest, private: false, publishConfig: { access: 'public' } },
    })).toEqual([
      '@monotykamary/dsh-experimental-prototype: experimental package must set "private": true',
      '@monotykamary/dsh-experimental-prototype: experimental package must omit publishConfig',
    ])
  })

  it.each(['dependencies', 'optionalDependencies', 'peerDependencies'] as const)(
    'rejects release %s on an experimental package',
    (section) => {
      expect(checkExperimentalDependencyIsolation([experimental, {
        dir: 'packages/core/consumer',
        manifest: {
          name: '@monotykamary/dsh-consumer',
          [section]: { '@monotykamary/dsh-experimental-prototype': 'workspace:^' },
        },
      }])).toEqual([
        `@monotykamary/dsh-consumer: ${section}.@monotykamary/dsh-experimental-prototype must not reference an experimental package`,
      ])
    },
  )

  it('allows development and experimental consumers but rejects the Python release runtime', () => {
    const manifests: WorkspaceManifest[] = [experimental, {
      dir: 'packages/core/test-only',
      manifest: {
        name: '@monotykamary/dsh-test-only',
        devDependencies: { '@monotykamary/dsh-experimental-prototype': 'workspace:^' },
      },
    }, {
      dir: 'packages/experimental/consumer',
      manifest: {
        name: '@monotykamary/dsh-experimental-consumer',
        dependencies: { '@monotykamary/dsh-experimental-prototype': 'workspace:^' },
      },
    }, {
      dir: 'python/sdk-runtime',
      manifest: {
        name: '@monotykamary/dsh-python-runtime',
        dependencies: { '@monotykamary/dsh-experimental-prototype': 'workspace:^' },
      },
    }]

    expect(checkExperimentalDependencyIsolation(manifests)).toEqual([
      '@monotykamary/dsh-python-runtime: dependencies.@monotykamary/dsh-experimental-prototype must not reference an experimental package',
    ])
  })
})
