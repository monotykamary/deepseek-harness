import { describe, expect, it } from 'vitest'
import { finalDistTag, promotionRequired, publicationTagArgs, RELEASE_CANDIDATE_TAG } from './npm-tags.ts'
import { isTransientNpmWriteFailure } from './npm-write.ts'
import { bunPublishInvocation } from './publish.ts'

describe('npm release tags', () => {
  it('stages every version without moving latest or next', () => {
    expect(publicationTagArgs('1.2.3', true)).toEqual(['--tag', RELEASE_CANDIDATE_TAG])
    expect(publicationTagArgs('1.2.3-rc.1', true)).toEqual(['--tag', RELEASE_CANDIDATE_TAG])
  })

  it('publishes packed artifacts through Bun with the selected tag', () => {
    expect(bunPublishInvocation('/tmp/pkg.tgz', ['--tag', RELEASE_CANDIDATE_TAG])).toEqual({
      command: 'bun',
      args: ['publish', '--tag', RELEASE_CANDIDATE_TAG, '/tmp/pkg.tgz'],
    })
  })

  it('promotes stable releases to latest and prereleases to next', () => {
    expect(finalDistTag('1.2.3')).toBe('latest')
    expect(finalDistTag('1.2.3-rc.1')).toBe('next')
    expect(publicationTagArgs('1.2.3', false)).toEqual(['--tag', 'latest'])
    expect(publicationTagArgs('1.2.3-rc.1', false)).toEqual(['--tag', 'next'])
  })

  it('allows only idempotent or forward promotion', () => {
    expect(promotionRequired('@scope/pkg', 'latest', undefined, '1.2.3')).toBe(true)
    expect(promotionRequired('@scope/pkg', 'latest', '1.2.2', '1.2.3')).toBe(true)
    expect(promotionRequired('@scope/pkg', 'latest', '1.2.3', '1.2.3')).toBe(false)
    expect(() => promotionRequired('@scope/pkg', 'latest', '1.2.4', '1.2.3')).toThrow(/refusing to move/u)
  })

  it('retries only registry conditions that may settle', () => {
    expect(isTransientNpmWriteFailure('npm error code E409')).toBe(true)
    expect(isTransientNpmWriteFailure('npm error code E503')).toBe(true)
    expect(isTransientNpmWriteFailure('npm error code E403')).toBe(false)
  })
})
