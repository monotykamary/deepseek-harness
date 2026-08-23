import type { IUnicodeVersionProvider, Terminal } from '@xterm/xterm'
import { UnicodeGraphemesAddon } from '@xterm/addon-unicode-graphemes'
import { describe, expect, it } from 'vitest'
import { EmojiWidthUnicodeProvider } from '../src/client/emoji-width-unicode-provider.ts'
import { bunWidthOverride, isWideJoiningMarkOverride } from '../src/client/bun-width-overrides.ts'

const extractWidth = (props: number): number => (props >> 1) & 0x3
const extractShouldJoin = (props: number): boolean => (props & 1) !== 0

const createRealProvider = (
  isNormalBufferActive: () => boolean = () => true,
): EmojiWidthUnicodeProvider => {
  const providers: Record<string, IUnicodeVersionProvider> = {}
  const fakeTerminal = {
    unicode: {
      register(provider: IUnicodeVersionProvider) {
        providers[provider.version] = provider
      },
      activeVersion: '',
    },
  } as unknown as Terminal
  new UnicodeGraphemesAddon().activate(fakeTerminal)
  const base = providers['15-graphemes']
  if (!base) throw new Error('15-graphemes provider not registered')
  return new EmojiWidthUnicodeProvider(base, isNormalBufferActive)
}

const clusterWidth = (provider: EmojiWidthUnicodeProvider, text: string): number => {
  let total = 0
  let preceding = 0
  for (const ch of text) {
    const props = provider.charProperties(ch.codePointAt(0) ?? 0, preceding)
    let width = extractWidth(props)
    if (extractShouldJoin(props)) width -= extractWidth(preceding)
    total += width
    preceding = props
  }
  return total
}

describe('EmojiWidthUnicodeProvider', () => {
  const provider = createRealProvider()

  it('keeps Emoji_Presentation + EAW=Narrow symbols at width 1 to match app-side stringWidth', () => {
    for (const codepoint of [0x23fa, 0x2714, 0x2718, 0x26a0, 0x2612, 0x25fb, 0x25cb, 0x25cf]) {
      expect(provider.wcwidth(codepoint)).toBe(1)
      expect(extractWidth(provider.charProperties(codepoint, 0))).toBe(1)
    }
  })

  it('widens Emoji 14/15 symbols the bundled Unicode data under-counts', () => {
    for (const codepoint of [0x1fae0, 0x1f979, 0x1f6df, 0x1faa9, 0x1fa75]) {
      expect(provider.wcwidth(codepoint)).toBe(2)
      expect(extractWidth(provider.charProperties(codepoint, 0))).toBe(2)
    }
  })

  it('leaves variation selector-16 clustering intact', () => {
    const warning = provider.charProperties(0x26a0, 0)
    expect(extractWidth(warning)).toBe(1)
    const withVs16 = provider.charProperties(0xfe0f, warning)
    expect(extractWidth(withVs16)).toBe(2)
    expect(extractShouldJoin(withVs16)).toBe(true)
  })

  it('preserves the join bit when widening skin-tone modifiers after an emoji base', () => {
    const thumbsUp = provider.charProperties(0x1f44d, 0)
    const withTone = provider.charProperties(0x1f3fc, thumbsUp)
    expect(extractShouldJoin(withTone)).toBe(true)
    expect(extractWidth(withTone)).toBe(2)
  })

  it('delegates unlisted codepoints to the base provider', () => {
    expect(provider.wcwidth(0x61)).toBe(1) // a
    expect(provider.wcwidth(0x4e00)).toBe(2) // 一
    expect(provider.wcwidth(0x1f600)).toBe(2) // 😀 already wide in the base data
  })

  it('zeroes invisible format characters the bundled Unicode data counts as 1', () => {
    for (const codepoint of [0x200b, 0xfeff, 0x00ad, 0x200e, 0x200f, 0x2060, 0x2064]) {
      expect(provider.wcwidth(codepoint)).toBe(0)
      expect(extractWidth(provider.charProperties(codepoint, 0))).toBe(0)
    }
  })

  it('joins zeroed format characters into the preceding cell without advancing it', () => {
    const letter = provider.charProperties(0x78, 0) // x
    const zwsp = provider.charProperties(0x200b, letter)
    expect(extractShouldJoin(zwsp)).toBe(true)
    expect(extractWidth(zwsp)).toBe(extractWidth(letter))
    const wide = provider.charProperties(0x4e00, 0) // 一
    const bomAfterWide = provider.charProperties(0xfeff, wide)
    expect(extractShouldJoin(bomAfterWide)).toBe(true)
    expect(extractWidth(bomAfterWide)).toBe(2)
  })

  it('widens ideographic description characters added in Unicode 15.1', () => {
    for (const codepoint of [0x2ffc, 0x2fff, 0x31ef]) {
      expect(provider.wcwidth(codepoint)).toBe(2)
      expect(extractWidth(provider.charProperties(codepoint, 0))).toBe(2)
    }
  })

  it('keeps a line that stringWidth counts as exactly fitting on a single terminal row', () => {
    const line = `${'x'.repeat(40)}\u200b${'y'.repeat(40)}`
    let total = 0
    let preceding = 0
    for (const ch of line) {
      const props = provider.charProperties(ch.codePointAt(0) ?? 0, preceding)
      let width = extractWidth(props)
      if (extractShouldJoin(props)) {
        const prevWidth = extractWidth(preceding)
        total -= prevWidth
        width = Math.max(width, prevWidth)
      }
      total += width
      preceding = props
    }
    expect(total).toBe(80)
  })

  it('matches Bun by giving non-Latin combining marks a spacing cell in the normal buffer', () => {
    const provider = createRealProvider(() => true)
    expect(clusterWidth(provider, 'א֨')).toBe(2) // Hebrew alef + accent qadma
    expect(clusterWidth(provider, 'اً')).toBe(2) // Arabic alef + fathatan
    expect(clusterWidth(provider, 'е҈')).toBe(2) // Cyrillic + hundred-thousands sign
    expect(clusterWidth(provider, 'が')).toBe(4) // か + combining voiced sound mark
  })

  it('leaves combining-mark joins intact in the alternate buffer for correct TUIs', () => {
    const provider = createRealProvider(() => false)
    expect(clusterWidth(provider, 'א֨')).toBe(1)
    expect(clusterWidth(provider, 'اً')).toBe(1)
    expect(clusterWidth(provider, 'е҈')).toBe(1)
    expect(clusterWidth(provider, 'が')).toBe(2)
  })

  it('makes combining enclosing keycap U+20E3 a 2-column spacing cell to match Bun', () => {
    const provider = createRealProvider(() => true)
    expect(provider.wcwidth(0x20e3)).toBe(2)
    expect(clusterWidth(provider, '1\u20E3')).toBe(2)
    expect(clusterWidth(provider, '1\uFE0F\u20E3')).toBe(2)
  })

  it('makes CJK ideographic tone marks U+302A–U+302F wide spacing cells to match Bun', () => {
    const provider = createRealProvider(() => true)
    expect(provider.wcwidth(0x302a)).toBe(2)
    expect(provider.wcwidth(0x302f)).toBe(2)
    expect(clusterWidth(provider, '\u4E00\u302A')).toBe(4)
  })

  it('makes Tangut iteration mark U+16FE4 a 2-column spacing cell to match Bun', () => {
    const provider = createRealProvider(() => true)
    expect(provider.wcwidth(0x16fe4)).toBe(2)
  })

  it('makes rare Indic spacing-joining marks 1-column to match Bun', () => {
    const provider = createRealProvider(() => true)
    expect(provider.wcwidth(0x0d4e)).toBe(1)
    expect(provider.wcwidth(0x110bd)).toBe(1)
    expect(provider.wcwidth(0x110cd)).toBe(1)
    expect(provider.wcwidth(0x111c2)).toBe(1)
    expect(provider.wcwidth(0x11a3a)).toBe(1)
    expect(provider.wcwidth(0x11d46)).toBe(1)
  })

  it('suppresses wide and joining mark overrides in the alternate buffer', () => {
    const provider = createRealProvider(() => false)
    expect(provider.wcwidth(0x20e3)).toBe(0)
    expect(provider.wcwidth(0x302a)).toBe(0)
    expect(provider.wcwidth(0x0d4e)).toBe(0)
  })

  it('never disturbs marks Bun already joins, keycaps, or emoji clustering', () => {
    for (const isNormal of [true, false]) {
      const provider = createRealProvider(() => isNormal)
      expect(clusterWidth(provider, 'é')).toBe(1)
      expect(clusterWidth(provider, 'कि')).toBe(1)
      expect(clusterWidth(provider, '1️⃣')).toBe(2)
      expect(clusterWidth(provider, '\u{1f44d}\u{1f3fd}')).toBe(2)
    }
  })
})

describe('bunWidthOverride', () => {
  it('returns 0 for invisible characters Bun excludes but the addon counts as 1', () => {
    expect(bunWidthOverride(0x200b)).toBe(0) // ZWSP
    expect(bunWidthOverride(0xfeff)).toBe(0) // BOM
    expect(bunWidthOverride(0x00ad)).toBe(0) // soft hyphen
    expect(bunWidthOverride(0xe0001)).toBe(0) // language tag
  })

  it('returns 0 for Indic spacing marks Bun counts as zero-width joining', () => {
    expect(bunWidthOverride(0x093e)).toBe(0) // Devanagari vowel sign aa
    expect(bunWidthOverride(0x093f)).toBe(0) // Devanagari vowel sign i
    expect(bunWidthOverride(0x0940)).toBe(0) // Devanagari vowel sign ii
    expect(bunWidthOverride(0x0980)).toBe(0) // Bengali anji
    expect(bunWidthOverride(0x0a3e)).toBe(0) // Gurmukhi vowel sign aa
  })

  it('returns 1 for non-Latin combining marks Bun counts as a spacing cell', () => {
    expect(bunWidthOverride(0x05a8)).toBe(1) // Hebrew accent qadma
    expect(bunWidthOverride(0x064b)).toBe(1) // Arabic fathatan
    expect(bunWidthOverride(0x0488)).toBe(1) // Cyrillic hundred-thousands sign
    expect(bunWidthOverride(0xff9e)).toBe(1) // halfwidth katakana voiced mark
  })

  it('returns 1 for rare Indic spacing-joining marks Bun counts as 1', () => {
    expect(bunWidthOverride(0x0d4e)).toBe(1) // Malayalam letter dot reph
    expect(bunWidthOverride(0x110bd)).toBe(1) // Kaithi number sign
    expect(bunWidthOverride(0x110cd)).toBe(1) // Kaithi number sign above
    expect(bunWidthOverride(0x111c2)).toBe(1) // Sharada sign jhindam
    expect(bunWidthOverride(0x11a3a)).toBe(1) // Zanabazar Square sign yu
    expect(bunWidthOverride(0x11d46)).toBe(1) // Masaram Gondi repha
  })

  it('returns 2 for wide combining marks Bun counts as 2-col spacing cells', () => {
    expect(bunWidthOverride(0x20e3)).toBe(2) // combining enclosing keycap
    expect(bunWidthOverride(0x302a)).toBe(2) // ideographic level tone mark
    expect(bunWidthOverride(0x302f)).toBe(2) // Hangul double dot tone mark
    expect(bunWidthOverride(0x3099)).toBe(2) // combining katakana-hiragana voiced
    expect(bunWidthOverride(0x309a)).toBe(2) // combining katakana-hiragana semi-voiced
    expect(bunWidthOverride(0x16fe4)).toBe(2) // Tangut iteration mark
  })

  it('returns 2 for stale-narrow emoji ranges Bun counts as 2', () => {
    expect(bunWidthOverride(0x1fae0)).toBe(2) // melting face
    expect(bunWidthOverride(0x1f3fb)).toBe(2) // skin-tone modifier
    expect(bunWidthOverride(0x1faf8)).toBe(2) // rightwards pushing hand
    expect(bunWidthOverride(0x2ffc)).toBe(2) // Unicode 15.1 Wide
  })

  it('returns -1 for codepoints Bun and the addon agree on', () => {
    expect(bunWidthOverride(0x41)).toBe(-1) // A
    expect(bunWidthOverride(0x4e00)).toBe(-1) // 一
    expect(bunWidthOverride(0x1f600)).toBe(-1) // 😀
    expect(bunWidthOverride(0x20)).toBe(-1) // space
    expect(bunWidthOverride(0xfe0f)).toBe(-1) // VS16
    expect(bunWidthOverride(0x200c)).toBe(-1) // ZWNJ
  })

  it('keeps Emoji_Presentation + EAW=Narrow symbols at -1 (no override)', () => {
    expect(bunWidthOverride(0x23fa)).toBe(-1) // ⏺
    expect(bunWidthOverride(0x2714)).toBe(-1) // ✔
    expect(bunWidthOverride(0x26a0)).toBe(-1) // ⚠
  })
})

describe('isWideJoiningMarkOverride', () => {
  it('identifies U+20E3 as a wide joining mark', () => {
    expect(isWideJoiningMarkOverride(0x20e3)).toBe(true)
  })

  it('flags wide marks that join into the preceding cluster', () => {
    expect(isWideJoiningMarkOverride(0x20e3)).toBe(true) // combining enclosing keycap
    expect(isWideJoiningMarkOverride(0x1f3fb)).toBe(true) // skin-tone modifier
    expect(isWideJoiningMarkOverride(0x1f3ff)).toBe(true) // skin-tone modifier
  })

  it('does not flag standalone wide marks as joining', () => {
    expect(isWideJoiningMarkOverride(0x302a)).toBe(false) // CJK tone mark
    expect(isWideJoiningMarkOverride(0x3099)).toBe(false) // CJK voiced mark
    expect(isWideJoiningMarkOverride(0x16fe4)).toBe(false) // Tangut mark
  })
})
