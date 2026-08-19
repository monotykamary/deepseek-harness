import { Buffer } from 'node:buffer'
import { describe, expect, it } from 'vitest'
import { BoundedByteBuffer, BoundedTextBuffer, utf8Tail } from '../src/bounded-output.ts'

function referenceText(chunks: readonly string[], maxBytes: number, maxLines?: number): string {
  let value = ''
  for (const chunk of chunks) {
    value += chunk
    if (maxLines !== undefined) {
      const lines = value.split('\n')
      if (lines.length > maxLines) value = lines.slice(lines.length - maxLines).join('\n')
    }
    while (Buffer.byteLength(value) > maxBytes) value = Array.from(value).slice(1).join('')
  }
  return value
}

describe('Bounded terminal output', () => {
  it('matches newline and UTF-8 tail semantics across chunk boundaries', () => {
    const chunks = ['alpha', '\nbeta\n', '🙂gamma', '\ndelta', '\n末尾']
    const text = new BoundedTextBuffer(24, 3)
    text.append('')
    expect(utf8Tail('ok', 2)).toEqual({ text: 'ok', truncated: false })
    for (const chunk of chunks) text.append(chunk)
    const expected = referenceText(chunks, 24, 3)

    expect(text.snapshot()).toEqual({ text: expected, truncated: true })
    expect(text.consume()).toEqual({ delta: expected, truncated: true })
    expect(text.snapshot()).toEqual({ text: '', truncated: false })
  })

  it('matches prior incremental semantics after every mixed append', () => {
    const chunks = Array.from({ length: 200 }, (_, index) =>
      ['x', '\n', '🙂', `line-${String(index % 7)}`][index % 4] as string)
    for (const maxLines of [1, 4, undefined]) {
      const text = new BoundedTextBuffer(17, maxLines)
      const accepted: string[] = []
      for (const chunk of chunks) {
        accepted.push(chunk)
        text.append(chunk)
        expect(text.snapshot().text).toBe(referenceText(accepted, 17, maxLines))
      }
    }
  })

  it('retains a bounded byte tail without shifting the active array', () => {
    const bytes = new BoundedByteBuffer(4)
    bytes.append(Buffer.alloc(0))
    bytes.append(new Uint8Array([97]))
    for (const value of ['ab', 'c', 'def']) bytes.append(Buffer.from(value))
    expect(bytes.snapshot()).toEqual({ bytes: Buffer.from('cdef'), truncated: true })

    for (let index = 0; index < 2_100; index += 1) bytes.append(Buffer.from('x'))
    expect(bytes.snapshot()).toEqual({ bytes: Buffer.from('xxxx'), truncated: true })
  })

  it('compacts consumed text chunks without changing the active suffix', () => {
    const compact = new BoundedTextBuffer(1)
    for (let index = 0; index < 2_100; index += 1) compact.append('x')
    expect(compact.snapshot().text).toBe('x')

    const delayed = new BoundedTextBuffer(2_000)
    for (let index = 0; index < 4_100; index += 1) delayed.append('x')
    expect(delayed.snapshot().text).toBe('x'.repeat(2_000))
  })

  it('retains text without a line bound and drops complete leading chunks by bytes', () => {
    const text = new BoundedTextBuffer(4)
    text.append('ab')
    text.append('cdef')
    expect(text.snapshot()).toEqual({ text: 'cdef', truncated: true })
  })
})
