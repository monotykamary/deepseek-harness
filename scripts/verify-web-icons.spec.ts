import { describe, expect, it } from 'vitest'
import { webIconViolations } from './verify-web-icons.ts'

describe('webIconViolations', () => {
  it('accepts canonical icons from the shared barrel', () => {
    expect(webIconViolations(
      'packages/client/example/src/View.tsx',
      "import { Search } from '@monotykamary/dsh-client-ui-primitives'\nexport const view = <Search />",
    )).toEqual([])
  })

  it('rejects direct Lucide imports outside the barrel', () => {
    expect(webIconViolations(
      'packages/client/example/src/View.tsx',
      "import { Search } from 'lucide-react'",
    )[0]).toContain('ui-primitives')
  })

  it('rejects legacy icon names', () => {
    expect(webIconViolations(
      'packages/client/example/src/View.tsx',
      'const view = <IconSearchOutline16 />',
    )[0]).toContain('legacy ic_ds')
  })

  it('rejects inline SVG action glyphs', () => {
    expect(webIconViolations(
      'packages/client/example/src/View.tsx',
      'const view = <svg><path /></svg>',
    )[0]).toContain('inline SVG')
  })

  it('retains the logo SVG exemption', () => {
    expect(webIconViolations(
      'packages/client/ui-primitives/src/FishLogo.tsx',
      'export const FishLogo = () => <svg><path /></svg>',
    )).toEqual([])
  })
})
