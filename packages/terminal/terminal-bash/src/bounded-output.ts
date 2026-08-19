/** Incremental bounded retention for terminal text and raw replay. */

import { Buffer } from 'node:buffer'
import type { TerminalSendRead } from '@monotykamary/dsh-terminal'

interface TextChunk {
  text: string
  bytes: number
  lineBreaks: number
}

function countLineBreaks(text: string): number {
  let count = 0
  let index = text.indexOf('\n')
  while (index !== -1) {
    count += 1
    index = text.indexOf('\n', index + 1)
  }
  return count
}

/**
 * Retain the longest code-point-aligned UTF-8 suffix within a byte limit.
 * @param text - decoded text to bound.
 * @param maxBytes - maximum UTF-8 bytes returned.
 * @returns retained suffix and whether a prefix was removed.
 */
export function utf8Tail(text: string, maxBytes: number): { text: string; truncated: boolean } {
  if (Buffer.byteLength(text) <= maxBytes) return { text, truncated: false }
  const chars = Array.from(text)
  let bytes = 0
  let start = chars.length
  while (start > 0) {
    const next = Buffer.byteLength(chars[start - 1] as string)
    if (bytes + next > maxBytes) break
    bytes += next
    start -= 1
  }
  return { text: chars.slice(start).join(''), truncated: true }
}

/** Text retention that trims only the affected leading chunks. */
export class BoundedTextBuffer {
  private chunks: TextChunk[] = []
  private head = 0
  private byteLength = 0
  private lineBreaks = 0
  private dropped = false

  /**
   * @param maxBytes - maximum UTF-8 bytes retained.
   * @param maxLines - maximum newline-split segments retained when provided.
   */
  constructor(
    private readonly maxBytes: number,
    private readonly maxLines?: number,
  ) {}

  /**
   * Append decoded output and incrementally trim leading line or byte overflow.
   * @param text - terminal output appended in delivery order.
   */
  append(text: string): void {
    if (text.length === 0) return
    const chunk: TextChunk = {
      text,
      bytes: Buffer.byteLength(text),
      lineBreaks: countLineBreaks(text),
    }
    this.chunks.push(chunk)
    this.byteLength += chunk.bytes
    this.lineBreaks += chunk.lineBreaks
    this.trimLines()
    this.trimBytes()
    this.compact()
  }

  /**
   * Consume the retained delta and reset truncation state.
   * @returns all text and truncation accumulated since the prior consume.
   */
  consume(): TerminalSendRead {
    const result = this.snapshot()
    this.chunks = []
    this.head = 0
    this.byteLength = 0
    this.lineBreaks = 0
    this.dropped = false
    return { delta: result.text, truncated: result.truncated }
  }

  /**
   * Concatenate retained chunks without changing buffer state.
   * @returns current text and cumulative truncation state.
   */
  snapshot(): { text: string; truncated: boolean } {
    return {
      text: this.chunks.slice(this.head).map(chunk => chunk.text).join(''),
      truncated: this.dropped,
    }
  }

  private trimLines(): void {
    if (this.maxLines === undefined) return
    let excess = this.lineBreaks - (this.maxLines - 1)
    while (excess > 0) {
      const first = this.chunks[this.head] as TextChunk
      if (first.lineBreaks < excess) {
        excess -= first.lineBreaks
        this.dropFirst()
        continue
      }
      let cut = 0
      for (let index = 0; index < excess; index += 1) {
        cut = first.text.indexOf('\n', cut) + 1
      }
      this.replaceFirst(first.text.slice(cut))
      this.dropped = true
      excess = 0
    }
  }

  private trimBytes(): void {
    let overflow = this.byteLength - this.maxBytes
    while (overflow > 0) {
      const first = this.chunks[this.head] as TextChunk
      this.dropped = true
      if (first.bytes <= overflow) {
        overflow -= first.bytes
        this.dropFirst()
        continue
      }
      this.replaceFirst(utf8Tail(first.text, first.bytes - overflow).text)
      overflow = 0
    }
  }

  private replaceFirst(text: string): void {
    const previous = this.chunks[this.head] as TextChunk
    const next: TextChunk = {
      text,
      bytes: Buffer.byteLength(text),
      lineBreaks: countLineBreaks(text),
    }
    this.chunks[this.head] = next
    this.byteLength += next.bytes - previous.bytes
    this.lineBreaks += next.lineBreaks - previous.lineBreaks
    if (text.length === 0) this.dropFirst()
  }

  private dropFirst(): void {
    const first = this.chunks[this.head] as TextChunk
    this.byteLength -= first.bytes
    this.lineBreaks -= first.lineBreaks
    this.head += 1
    this.dropped = true
  }

  private compact(): void {
    if (this.head < 1024 || this.head < this.chunks.length - this.head) return
    this.chunks = this.chunks.slice(this.head)
    this.head = 0
  }
}

/** Raw replay retention with constant-time leading chunk removal. */
export class BoundedByteBuffer {
  private chunks: Buffer[] = []
  private head = 0
  private byteLength = 0
  private dropped = false

  /** @param maxBytes - maximum raw bytes retained. */
  constructor(private readonly maxBytes: number) {}

  /**
   * Append immutable terminal bytes and incrementally trim leading overflow.
   * @param value - bytes appended in delivery order.
   */
  append(value: Uint8Array): void {
    if (value.byteLength === 0) return
    const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value)
    this.chunks.push(chunk)
    this.byteLength += chunk.byteLength
    while (this.byteLength > this.maxBytes) {
      const first = this.chunks[this.head] as Buffer
      const overflow = this.byteLength - this.maxBytes
      this.dropped = true
      if (overflow >= first.byteLength) {
        this.head += 1
        this.byteLength -= first.byteLength
      } else {
        this.chunks[this.head] = first.subarray(overflow)
        this.byteLength -= overflow
      }
    }
    if (this.head >= 1024 && this.head >= this.chunks.length - this.head) {
      this.chunks = this.chunks.slice(this.head)
      this.head = 0
    }
  }

  /**
   * Concatenate retained raw chunks without changing buffer state.
   * @returns one replay buffer and cumulative truncation state.
   */
  snapshot(): { bytes: Buffer; truncated: boolean } {
    return {
      bytes: Buffer.concat(this.chunks.slice(this.head), this.byteLength),
      truncated: this.dropped,
    }
  }
}
