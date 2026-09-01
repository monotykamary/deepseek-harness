// Incremental extractor for the top-level `code` string in a partially streamed
// run_code JSON argument object. It decodes escapes without accepting a nested
// decoy and fails closed at the configured byte cap.

const ESCAPES: Record<string, string> = {
  '"': '"',
  '\\': '\\',
  '/': '/',
  b: '\b',
  f: '\f',
  n: '\n',
  r: '\r',
  t: '\t',
}

type Scan = { end: number; value?: string } | 'invalid' | undefined

/** Bounded incremental decoder for the top-level `code` string in streamed arguments. */
export class PartialCodeFieldExtractor {
  private raw = ''
  private codeStart = -1
  private cursor = 0
  private decoded = ''
  private completeValue = false
  private failed = false

  constructor(private readonly maxBytes: number) {}

  /**
   * Report whether the top-level code value is complete.
   * @returns whether its closing quote was observed.
   */
  get complete(): boolean {
    return this.completeValue
  }

  /**
   * Expose the safely decoded prefix accumulated so far.
   * @returns the prefix, or undefined before discovery or after rejection.
   */
  get code(): string | undefined {
    return this.failed || this.codeStart === -1 ? undefined : this.decoded
  }

  /**
   * Report whether this stream failed closed.
   * @returns whether malformed input or the byte cap permanently rejected it.
   */
  get rejected(): boolean {
    return this.failed
  }

  /**
   * Consume one provider argument delta.
   * @param delta - the next raw JSON fragment in stream order.
   */
  push(delta: string): void {
    if (this.completeValue || this.failed) return
    if (Buffer.byteLength(this.raw, 'utf8') + Buffer.byteLength(delta, 'utf8') > this.maxBytes) {
      this.reject()
      return
    }
    this.raw += delta
    if (this.codeStart === -1) {
      const located = findTopLevelCodeValue(this.raw)
      if (located === 'invalid') {
        this.reject()
        return
      }
      if (located === undefined) return
      this.codeStart = located
      this.cursor = located
    }
    while (this.cursor < this.raw.length) {
      const char = this.raw.charAt(this.cursor)
      if (char === '"') {
        this.completeValue = true
        this.cursor = this.raw.length
        return
      }
      if (char === '\\') {
        if (this.cursor + 1 >= this.raw.length) return
        const escaped = this.raw.charAt(this.cursor + 1)
        if (escaped === 'u') {
          if (this.cursor + 5 >= this.raw.length) return
          const hex = this.raw.slice(this.cursor + 2, this.cursor + 6)
          if (!/^[0-9a-fA-F]{4}$/u.test(hex)) {
            this.reject()
            return
          }
          this.decoded += String.fromCharCode(Number.parseInt(hex, 16))
          this.cursor += 6
          continue
        }
        const mapped = ESCAPES[escaped]
        if (mapped === undefined) {
          this.reject()
          return
        }
        this.decoded += mapped
        this.cursor += 2
        continue
      }
      if (char < ' ') {
        this.reject()
        return
      }
      this.decoded += char
      this.cursor += 1
    }
  }

  private reject(): void {
    this.failed = true
    this.raw = ''
    this.decoded = ''
  }
}

/**
 * Parse final provider arguments and require exactly one top-level string `code`.
 * @param argumentsJson - the complete raw JSON argument object.
 * @returns the authoritative code string, or undefined when the object is invalid or ambiguous.
 */
export function authoritativeCode(argumentsJson: string): string | undefined {
  let value: unknown
  try {
    value = JSON.parse(argumentsJson)
  } catch {
    return undefined
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const code = (value as Record<string, unknown>).code
  if (typeof code !== 'string' || topLevelCodeCount(argumentsJson) !== 1) return undefined
  return code
}

function findTopLevelCodeValue(raw: string): number | 'invalid' | undefined {
  let cursor = skipWhitespace(raw, 0)
  if (cursor >= raw.length) return undefined
  if (raw[cursor] !== '{') return 'invalid'
  cursor += 1
  while (true) {
    cursor = skipWhitespace(raw, cursor)
    if (cursor >= raw.length) return undefined
    if (raw[cursor] === '}') return 'invalid'
    if (raw[cursor] !== '"') return 'invalid'
    const key = scanString(raw, cursor)
    if (key === undefined) return undefined
    if (key === 'invalid' || key.value === undefined) return 'invalid'
    cursor = skipWhitespace(raw, key.end)
    if (cursor >= raw.length) return undefined
    if (raw[cursor] !== ':') return 'invalid'
    cursor = skipWhitespace(raw, cursor + 1)
    if (cursor >= raw.length) return undefined
    if (key.value === 'code') return raw[cursor] === '"' ? cursor + 1 : 'invalid'
    const value = scanValue(raw, cursor)
    if (value === undefined) return undefined
    if (value === 'invalid') return 'invalid'
    cursor = skipWhitespace(raw, value.end)
    if (cursor >= raw.length) return undefined
    if (raw[cursor] === ',') {
      cursor += 1
      continue
    }
    if (raw[cursor] === '}') return 'invalid'
    return 'invalid'
  }
}

function topLevelCodeCount(raw: string): number {
  let cursor = skipWhitespace(raw, 0)
  if (raw[cursor] !== '{') return 0
  cursor += 1
  let count = 0
  while (true) {
    cursor = skipWhitespace(raw, cursor)
    if (raw[cursor] === '}') return count
    if (raw[cursor] !== '"') return 0
    const key = scanString(raw, cursor)
    if (key === undefined || key === 'invalid' || key.value === undefined) return 0
    if (key.value === 'code') count += 1
    cursor = skipWhitespace(raw, key.end)
    if (raw[cursor] !== ':') return 0
    cursor = skipWhitespace(raw, cursor + 1)
    const value = scanValue(raw, cursor)
    if (value === undefined || value === 'invalid') return 0
    cursor = skipWhitespace(raw, value.end)
    if (raw[cursor] === ',') {
      cursor += 1
      continue
    }
    if (raw[cursor] === '}') return count
    return 0
  }
}

function scanValue(raw: string, start: number): Scan {
  const first = raw[start]
  if (first === undefined) return undefined
  if (first === '"') return scanString(raw, start)
  if (first === '{' || first === '[') {
    const stack = [first]
    let cursor = start + 1
    while (cursor < raw.length) {
      const char = raw.charAt(cursor)
      if (char === '"') {
        const string = scanString(raw, cursor)
        if (string === undefined || string === 'invalid') return string
        cursor = string.end
        continue
      }
      if (char === '{' || char === '[') stack.push(char)
      else if (char === '}' || char === ']') {
        const open = stack.pop()
        if ((open === '{' && char !== '}') || (open === '[' && char !== ']')) return 'invalid'
        if (stack.length === 0) {
          const end = cursor + 1
          return isCompleteJsonValue(raw.slice(start, end)) ? { end } : 'invalid'
        }
      }
      cursor += 1
    }
    return undefined
  }
  let cursor = start
  while (cursor < raw.length && raw[cursor] !== ',' && raw[cursor] !== '}') cursor += 1
  if (cursor === raw.length) return undefined
  return isCompleteJsonValue(raw.slice(start, cursor)) ? { end: cursor } : 'invalid'
}

function isCompleteJsonValue(token: string): boolean {
  try {
    JSON.parse(token)
    return true
  } catch {
    return false
  }
}

function scanString(raw: string, start: number): Scan {
  let cursor = start + 1
  while (cursor < raw.length) {
    const char = raw.charAt(cursor)
    if (char === '"') {
      const token = raw.slice(start, cursor + 1)
      try {
        const value: unknown = JSON.parse(token)
        return typeof value === 'string' ? { end: cursor + 1, value } : 'invalid'
      } catch {
        return 'invalid'
      }
    }
    if (char === '\\') {
      cursor += 1
      if (cursor >= raw.length) return undefined
      if (raw[cursor] === 'u') {
        if (cursor + 4 >= raw.length) return undefined
        if (!/^[0-9a-fA-F]{4}$/u.test(raw.slice(cursor + 1, cursor + 5))) return 'invalid'
        cursor += 4
      } else if (!Object.hasOwn(ESCAPES, raw.charAt(cursor))) {
        return 'invalid'
      }
    } else if (char < ' ') {
      return 'invalid'
    }
    cursor += 1
  }
  return undefined
}

function skipWhitespace(raw: string, start: number): number {
  let cursor = start
  while (cursor < raw.length && /\s/u.test(raw.charAt(cursor))) cursor += 1
  return cursor
}
