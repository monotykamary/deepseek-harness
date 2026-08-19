/** Adapted from localterm revision 8de7394; MIT license in THIRD_PARTY_NOTICES.md. */

import {
  MINIMUM_LIGATURE_SEQUENCE_CHARACTERS_COUNT,
  WWW_LIGATURE_SEQUENCE_CHARACTERS_COUNT,
} from './constants.ts'

// xterm renders every range returned by a character joiner as one atlas glyph,
// even when the active font makes no substitution. Joining arbitrary punctuation
// therefore creates dark or light boundary strokes where an unchanged run meets
// the following cell. Only return spans that match known programming-ligature
// families; the browser-facing support probe then removes candidates unsupported
// by the active font. Maximal arrow/rule families remain intact so Fira Code can
// apply its overlapping contextual substitutions at arbitrary lengths.
//
// Fira Code's non-operator families are included as candidates as well: the
// disambiguation pairs (fi, fj, Fl, Il, Tl), www, and hex/dimension literals.
// Adjacent independent candidates remain separate because xterm supports adjacent
// ranges and shaping them together only expands the artifact surface.

const EQUAL_LIGATURE_CHARACTERS: ReadonlySet<string> = new Set('!/:<=>|~'.split(''))
const HYPHEN_LIGATURE_CHARACTERS: ReadonlySet<string> = new Set('-<>|'.split(''))
const CENTERED_COLON_LIGATURE_CHARACTERS: ReadonlySet<string> = new Set(':<>'.split(''))
const UNDERSCORE_LIGATURE_CHARACTERS: ReadonlySet<string> = new Set('_|'.split(''))
const NUMBER_SIGN_LIGATURE_CHARACTERS: ReadonlySet<string> = new Set(['#'])

const KNOWN_OPERATOR_LIGATURES = [
  '<---->',
  '<====>',
  '<--->',
  '<===>',
  '<!---',
  '<---',
  '--->',
  '<-->',
  '<==>',
  '<===',
  '===>',
  '<!--',
  '!===',
  '<*>',
  '<|>',
  '<~~',
  '~~>',
  '<--',
  '<<-',
  '->>',
  '<==',
  '<<=',
  '=>>',
  '==>',
  '>>=',
  '<->',
  '<=>',
  ':::',
  '</>',
  '===',
  '!==',
  '+++',
  '<-',
  '->',
  '<=',
  '=>',
  '>=',
  '::',
  '</',
  '/>',
  '==',
  '!=',
  '/=',
  '~=',
  '<>',
  '<:',
  ':=',
  '*=',
  '*+',
  '<*',
  '*>',
  '<|',
  '|>',
  '+*',
  '=*',
  '=:',
  ':>',
  '/*',
  '*/',
].sort((left, right) => right.length - left.length)

const CONJUNCTION_LIGATURES = ['/\\', '\\/']
const LETTER_LIGATURE_PAIRS: ReadonlySet<string> = new Set(['fi', 'fj', 'Fl', 'Il', 'Tl'])
const HEX_DIGITS: ReadonlySet<string> = new Set('0123456789abcdefABCDEF'.split(''))
const DECIMAL_DIGITS: ReadonlySet<string> = new Set('0123456789'.split(''))

const isDigit = (character: string | undefined): boolean =>
  character !== undefined && DECIMAL_DIGITS.has(character)
const isHexDigit = (character: string | undefined): boolean =>
  character !== undefined && HEX_DIGITS.has(character)

const findQualifiedCharacterRuns = (
  text: string,
  characters: ReadonlySet<string>,
  qualifies: (run: string) => boolean,
): [number, number][] => {
  const ranges: [number, number][] = []
  let runStart: number | undefined
  for (let index = 0; index <= text.length; index += 1) {
    const character = text[index]
    const isRunCharacter = index < text.length
      && character !== undefined
      && characters.has(character)
    if (isRunCharacter) {
      runStart ??= index
      continue
    }
    if (runStart === undefined) continue
    const run = text.slice(runStart, index)
    if (run.length >= MINIMUM_LIGATURE_SEQUENCE_CHARACTERS_COUNT && qualifies(run)) {
      ranges.push([runStart, index])
    }
    runStart = undefined
  }
  return ranges
}

const findOperatorFamilyRuns = (text: string): [number, number][] => [
  ...findQualifiedCharacterRuns(text, EQUAL_LIGATURE_CHARACTERS, run => run.includes('=')),
  ...findQualifiedCharacterRuns(text, HYPHEN_LIGATURE_CHARACTERS, run => run.includes('-')),
  ...findQualifiedCharacterRuns(
    text,
    CENTERED_COLON_LIGATURE_CHARACTERS,
    run => run.includes(':') && (run.includes('<') || run.includes('>')),
  ),
  ...findQualifiedCharacterRuns(text, NUMBER_SIGN_LIGATURE_CHARACTERS, () => true),
]

const findKnownOperatorLigatures = (text: string): [number, number][] => {
  const ranges: [number, number][] = []
  let index = 0
  while (index < text.length) {
    const sequence = KNOWN_OPERATOR_LIGATURES.find(candidate =>
      text.startsWith(candidate, index),
    )
    if (!sequence) {
      index += 1
      continue
    }
    ranges.push([index, index + sequence.length])
    index += sequence.length
  }
  return ranges
}

const findConjunctionLigatures = (text: string): [number, number][] => {
  const ranges: [number, number][] = []
  for (let index = 0; index < text.length; index += 1) {
    const sequence = CONJUNCTION_LIGATURES.find(candidate => text.startsWith(candidate, index))
    if (!sequence) continue
    const precedingCharacter = text[index - 1]
    const followingCharacter = text[index + sequence.length]
    const hasLeadingBoundary = precedingCharacter === undefined || precedingCharacter === ' '
    const hasTrailingBoundary = followingCharacter === undefined || followingCharacter === ' '
    if (hasLeadingBoundary && hasTrailingBoundary) {
      ranges.push([index, index + sequence.length])
      index += sequence.length - 1
    }
  }
  return ranges
}

const findUnderscoreLigatureRuns = (text: string): [number, number][] =>
  findQualifiedCharacterRuns(text, UNDERSCORE_LIGATURE_CHARACTERS, (run) => {
    const firstUnderscore = run.indexOf('_')
    return firstUnderscore >= 0 && firstUnderscore !== run.lastIndexOf('_')
  }).map((range) => {
    const run = text.slice(range[0], range[1])
    return [range[0] + run.indexOf('_'), range[0] + run.lastIndexOf('_') + 1]
  })

// <digits>x<hex-or-digits>+ matches 0xFF, 0xDEADBEEF, 1920x1080, 0x0, and 1x1.
// A lone 0x is excluded because Fira Code only substitutes x when another
// hexadecimal or decimal glyph follows it.
const findHexDimensionRuns = (text: string): [number, number][] => {
  const ranges: [number, number][] = []
  let index = 0
  while (index < text.length) {
    if (!isDigit(text[index])) {
      index += 1
      continue
    }
    let digitEnd = index
    while (digitEnd < text.length && isDigit(text[digitEnd])) digitEnd += 1
    const separator = text[digitEnd]
    if (separator !== 'x' && separator !== 'X') {
      index = digitEnd
      continue
    }
    let hexEnd = digitEnd + 1
    while (hexEnd < text.length && isHexDigit(text[hexEnd])) hexEnd += 1
    if (hexEnd > digitEnd + 1) ranges.push([index, hexEnd])
    index = hexEnd
  }
  return ranges
}

const findLetterLigatureRuns = (text: string): [number, number][] => {
  const ranges: [number, number][] = []
  for (
    let index = 0;
    index + MINIMUM_LIGATURE_SEQUENCE_CHARACTERS_COUNT <= text.length;
    index += 1
  ) {
    const rangeEnd = index + MINIMUM_LIGATURE_SEQUENCE_CHARACTERS_COUNT
    if (LETTER_LIGATURE_PAIRS.has(text.slice(index, rangeEnd))) {
      ranges.push([index, rangeEnd])
    }
  }
  return ranges
}

// Fira Code ligatures exactly www: shorter or longer maximal w runs are left
// alone so xterm does not combine text the font will render unchanged.
const findWwwRuns = (text: string): [number, number][] => {
  const ranges: [number, number][] = []
  let runStart: number | undefined
  for (let index = 0; index <= text.length; index += 1) {
    const isW = index < text.length && text[index] === 'w'
    if (isW) {
      runStart ??= index
      continue
    }
    if (runStart === undefined) continue
    if (index - runStart === WWW_LIGATURE_SEQUENCE_CHARACTERS_COUNT) {
      ranges.push([runStart, index])
    }
    runStart = undefined
  }
  return ranges
}

// Overlapping candidates share shaping context, while adjacent independent
// ligatures remain separate rendering units as supported by xterm.
const mergeOverlappingRanges = (ranges: [number, number][]): [number, number][] => {
  const sortedRanges = [...ranges].sort((left, right) => left[0] - right[0] || left[1] - right[1])
  const mergedRanges: [number, number][] = []
  for (const range of sortedRanges) {
    const previousRange = mergedRanges[mergedRanges.length - 1]
    if (previousRange && range[0] < previousRange[1]) {
      previousRange[1] = Math.max(previousRange[1], range[1])
    } else {
      mergedRanges.push(range)
    }
  }
  return mergedRanges
}

/**
 * Find font-probe candidates for known programming ligature families.
 * @param text - one xterm render row.
 * @returns sorted half-open string-index ranges with overlaps merged.
 */
export const findLigatureRanges = (text: string): [number, number][] =>
  mergeOverlappingRanges([
    ...findOperatorFamilyRuns(text),
    ...findKnownOperatorLigatures(text),
    ...findConjunctionLigatures(text),
    ...findUnderscoreLigatureRuns(text),
    ...findHexDimensionRuns(text),
    ...findLetterLigatureRuns(text),
    ...findWwwRuns(text),
  ])
