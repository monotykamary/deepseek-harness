import { describe, expect, it } from 'vitest'
import { assertPublishedIntegrity } from './npm-package.ts'

describe('npm promotion integrity', () => {
  it('accepts only the packed bytes published under the candidate version', () => {
    expect(() => {
      assertPublishedIntegrity(
        { kind: 'present', integrity: 'sha512-same' }, 'sha512-same', '@scope/pkg', '1.2.3',
      )
    }).not.toThrow()
    expect(() => {
      assertPublishedIntegrity({ kind: 'absent' }, 'sha512-local', '@scope/pkg', '1.2.3')
    }).toThrow(/is not published/u)
    expect(() => {
      assertPublishedIntegrity(
        { kind: 'present', integrity: 'sha512-other' }, 'sha512-local', '@scope/pkg', '1.2.3',
      )
    }).toThrow(/registry bytes differ/u)
  })
})
