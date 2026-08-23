import { describe, expect, it } from 'vitest'
import { findLigatureRanges } from '../src/client/ligature-joiner.ts'

describe('findLigatureRanges — operator runs', () => {
  it('returns no ranges for text without any operator run', () => {
    expect(findLigatureRanges('hello world')).toEqual([])
  })

  it('returns no ranges for an empty string', () => {
    expect(findLigatureRanges('')).toEqual([])
  })

  it('does not join a single operator character surrounded by letters', () => {
    expect(findLigatureRanges('a-b')).toEqual([])
    expect(findLigatureRanges('>')).toEqual([])
  })

  it('joins a two-character operator run', () => {
    expect(findLigatureRanges('->')).toEqual([[0, 2]])
  })

  it('joins a maximal run rather than splitting on embedded shorter ligatures', () => {
    expect(findLigatureRanges('=>=>')).toEqual([[0, 4]])
  })

  it('handles the composable arrow families of any length', () => {
    expect(findLigatureRanges('--->')).toEqual([[0, 4]])
    expect(findLigatureRanges('====>')).toEqual([[0, 5]])
    expect(findLigatureRanges('<-->')).toEqual([[0, 4]])
  })

  it('handles the composable markdown rules of any length', () => {
    expect(findLigatureRanges('######')).toEqual([[0, 6]])
    expect(findLigatureRanges('------')).toEqual([[0, 6]])
    expect(findLigatureRanges('======')).toEqual([[0, 6]])
  })

  it('finds multiple non-overlapping operator runs in one line', () => {
    expect(findLigatureRanges('a => b >= c')).toEqual([
      [2, 4],
      [7, 9],
    ])
  })

  it('does not join operators separated by a space', () => {
    expect(findLigatureRanges('> =')).toEqual([])
  })

  it('does not join regex punctuation that has no ligature substitution', () => {
    const ansiPattern = String.raw`ansi.match(/\\x1b\\[(?:38|48);2;(\\d+);(\\d+);(\\d+)m/)`
    expect(findLigatureRanges(ansiPattern)).toEqual([])
  })

  it('keeps known non-arrow programming ligatures as candidates', () => {
    expect(findLigatureRanges('a :: b /* c */ d <|> e')).toEqual([
      [2, 4],
      [7, 9],
      [12, 14],
      [17, 20],
    ])
  })

  it('only joins slash-backslash conjunctions at shaping boundaries', () => {
    expect(findLigatureRanges(String.raw` /\ \/ `)).toEqual([
      [1, 3],
      [4, 6],
    ])
    expect(findLigatureRanges(String.raw`(/\x)`)).toEqual([])
  })

  it('joins Fira Code number-sign and underscore rule families', () => {
    expect(findLigatureRanges('## __ _|_ ||')).toEqual([
      [0, 2],
      [3, 5],
      [6, 9],
    ])
  })
})

describe('findLigatureRanges — letter ligatures', () => {
  it('joins the Fira Code disambiguation/standard pairs', () => {
    expect(findLigatureRanges('fi')).toEqual([[0, 2]])
    expect(findLigatureRanges('fj')).toEqual([[0, 2]])
    expect(findLigatureRanges('Fl')).toEqual([[0, 2]])
    expect(findLigatureRanges('Il')).toEqual([[0, 2]])
    expect(findLigatureRanges('Tl')).toEqual([[0, 2]])
  })

  it('joins the pair inside a word (Fira Code ligatures contextually)', () => {
    expect(findLigatureRanges('find')).toEqual([[0, 2]])
    expect(findLigatureRanges('flag')).toEqual([])
  })

  it('does not join pairs Fira Code does not ligature (fl, ff, ffl)', () => {
    expect(findLigatureRanges('fl')).toEqual([])
    expect(findLigatureRanges('ff')).toEqual([])
    expect(findLigatureRanges('ffl')).toEqual([])
  })

  it('joins an exactly-three w run (www)', () => {
    expect(findLigatureRanges('www')).toEqual([[0, 3]])
  })

  it('does not join a two-w or four-plus-w run (Fira Code ligatures only www)', () => {
    expect(findLigatureRanges('ww')).toEqual([])
    expect(findLigatureRanges('wwww')).toEqual([])
    expect(findLigatureRanges('wwwww')).toEqual([])
  })

  it('joins www only as a bounded three-w run within a larger string', () => {
    expect(findLigatureRanges('a www b')).toEqual([[2, 5]])
  })
})

describe('findLigatureRanges — hex and dimension literals', () => {
  it('joins hex literals', () => {
    expect(findLigatureRanges('0xFF')).toEqual([[0, 4]])
    expect(findLigatureRanges('0xDEADBEEF')).toEqual([[0, 10]])
    expect(findLigatureRanges('0xdeadbeef')).toEqual([[0, 10]])
  })

  it('joins dimension literals', () => {
    expect(findLigatureRanges('1920x1080')).toEqual([[0, 9]])
    expect(findLigatureRanges('1x1')).toEqual([[0, 3]])
  })

  it('does not join a lone 0x with no following hex digit', () => {
    expect(findLigatureRanges('0x')).toEqual([])
    expect(findLigatureRanges('10x')).toEqual([])
  })

  it('does not join digits or prose without an x separator', () => {
    expect(findLigatureRanges('3.14')).toEqual([])
    expect(findLigatureRanges('100')).toEqual([])
    expect(findLigatureRanges('face')).toEqual([])
    expect(findLigatureRanges('box')).toEqual([])
  })
})

describe('findLigatureRanges — range merging', () => {
  it('merges overlapping hex and letter sites so the run shapes as one unit', () => {
    // "0xf" (hex) and "fi" (letter) overlap at the f; merge to "0xfi".
    expect(findLigatureRanges('0xfin')).toEqual([[0, 4]])
  })

  it('keeps adjacent independent ligature sites in separate joined cells', () => {
    expect(findLigatureRanges('fi->')).toEqual([
      [0, 2],
      [2, 4],
    ])
  })

  it('keeps ligature sites separate when split by non-ligature characters', () => {
    expect(findLigatureRanges('fi ab ->')).toEqual([
      [0, 2],
      [6, 8],
    ])
  })

  it('returns string-index half-open ranges usable as substring bounds', () => {
    const text = 'const x = a >= b;'
    const ranges = findLigatureRanges(text)
    expect(ranges).toEqual([[12, 14]])
    const range = ranges[0]
    if (range === undefined) throw new Error('missing ligature range')
    expect(text.slice(range[0], range[1])).toBe('>=')
  })

  it('treats a trailing operator run as a range ending at the string boundary', () => {
    expect(findLigatureRanges('a ->')).toEqual([[2, 4]])
  })
})
