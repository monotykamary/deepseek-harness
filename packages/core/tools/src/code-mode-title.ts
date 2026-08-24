/**
 * Deterministic Code Mode run titles derived from model-authored arguments.
 *
 * The lexer recognizes only literal `tools.<name>(...)` and
 * `tools["<name>"](...)` calls. It never executes the program and ignores
 * comments, string contents, and dynamic template literals.
 * @module @monotykamary/dsh-tools/src/code-mode-title
 */

interface Token {
  readonly kind: 'identifier' | 'string' | 'punctuation'
  readonly text: string
}

interface ToolCallToken {
  readonly name: string
  readonly openIndex: number
}

const MAX_TITLE_CHARS = 80
const MAX_SEGMENT_CHARS = 64

function identifierStart(char: string): boolean {
  return /[A-Za-z_$]/u.test(char)
}

function identifierPart(char: string): boolean {
  return /[A-Za-z0-9_$]/u.test(char)
}

function escapedCharacter(source: string, index: number): { value: string; next: number } {
  const character = source[index]
  if (character === undefined) return { value: '', next: index }
  const simple: Record<string, string> = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', v: '\v', 0: '\0' }
  return { value: simple[character] ?? character, next: index + 1 }
}

function tokenize(source: string): Token[] {
  const tokens: Token[] = []
  let index = 0
  while (index < source.length) {
    const character = source.charAt(index)
    if (/\s/u.test(character)) {
      index += 1
      continue
    }
    if (character === '/' && source[index + 1] === '/') {
      const end = source.indexOf('\n', index + 2)
      if (end < 0) break
      index = end + 1
      continue
    }
    if (character === '/' && source[index + 1] === '*') {
      const end = source.indexOf('*/', index + 2)
      index = end < 0 ? source.length : end + 2
      continue
    }
    if (character === "'" || character === '"' || character === '`') {
      const quote = character
      let value = ''
      let dynamic = false
      index += 1
      while (index < source.length) {
        const current = source.charAt(index)
        if (current === quote) {
          index += 1
          break
        }
        if (quote === '`' && current === '$' && source[index + 1] === '{') dynamic = true
        if (current === '\\') {
          const escaped = escapedCharacter(source, index + 1)
          value += escaped.value
          index = escaped.next
          continue
        }
        value += current
        index += 1
      }
      if (!dynamic) tokens.push({ kind: 'string', text: value })
      continue
    }
    if (identifierStart(character)) {
      const start = index
      index += 1
      while (index < source.length && identifierPart(source.charAt(index))) index += 1
      tokens.push({ kind: 'identifier', text: source.slice(start, index) })
      continue
    }
    tokens.push({ kind: 'punctuation', text: character })
    index += 1
  }
  return tokens
}

function toolCallAt(tokens: readonly Token[], index: number): ToolCallToken | undefined {
  const head = tokens[index]
  if (head?.kind !== 'identifier' || head.text !== 'tools') return undefined
  const name = tokens[index + 2]
  if (tokens[index + 1]?.text === '.'
    && name?.kind === 'identifier'
    && tokens[index + 3]?.text === '(') {
    return { name: name.text, openIndex: index + 3 }
  }
  if (tokens[index + 1]?.text === '['
    && name?.kind === 'string'
    && tokens[index + 3]?.text === ']'
    && tokens[index + 4]?.text === '(') {
    return { name: name.text, openIndex: index + 4 }
  }
  return undefined
}

function directDescription(tokens: readonly Token[], openIndex: number): string | undefined {
  const stack: string[] = []
  for (let index = openIndex + 1; index < tokens.length; index += 1) {
    const token = tokens[index] as Token
    if (token.text === '(' || token.text === '[' || token.text === '{') {
      stack.push(token.text)
      continue
    }
    if (token.text === ')' || token.text === ']' || token.text === '}') {
      if (stack.length === 0) return undefined
      stack.pop()
      continue
    }
    if (stack.length !== 1 || stack[0] !== '{') continue
    const descriptionToken = tokens[index + 2]
    if ((token.kind === 'identifier' || token.kind === 'string')
      && token.text === 'description'
      && tokens[index + 1]?.text === ':'
      && descriptionToken?.kind === 'string') {
      const description = descriptionToken.text.replace(/\s+/gu, ' ').trim()
      return description === '' ? undefined : description
    }
  }
  return undefined
}

function clipWords(value: string, maximum: number): string {
  if (value.length <= maximum) return value
  const prefix = value.slice(0, maximum - 1)
  const boundary = prefix.lastIndexOf(' ')
  return `${boundary > 0 ? prefix.slice(0, boundary) : prefix}…`
}

function humanize(name: string): string {
  const words = name
    .replace(/[_-]+/gu, ' ')
    .replace(/([a-z0-9])([A-Z])/gu, '$1 $2')
    .trim()
  return words === '' ? 'tool' : words.replace(/^./u, character => character.toUpperCase())
}

function segmentFor(tokens: readonly Token[], call: ToolCallToken): string {
  const description = directDescription(tokens, call.openIndex)
  return clipWords(description ?? `Run ${humanize(call.name)}`, MAX_SEGMENT_CHARS)
}

/**
 * Infer a bounded title from literal tool calls in a Code Mode program.
 * @param code - model-authored program text; it is tokenized but never executed.
 * @returns a title, or `undefined` when the program has no recognizable tool call.
 */
export function inferRunCodeTitle(code: string): string | undefined {
  const tokens = tokenize(code)
  const counts = new Map<string, number>()
  for (let index = 0; index < tokens.length; index += 1) {
    const call = toolCallAt(tokens, index)
    if (call === undefined) continue
    const segment = segmentFor(tokens, call)
    counts.set(segment, (counts.get(segment) ?? 0) + 1)
  }
  if (counts.size === 0) return undefined

  let title = ''
  let omitted = false
  for (const [segment, count] of counts) {
    const counted = clipWords(count > 1 ? `${segment} ×${count}` : segment, MAX_TITLE_CHARS)
    const candidate = title === '' ? counted : `${title} + ${counted}`
    if (candidate.length > MAX_TITLE_CHARS) {
      omitted = true
      break
    }
    title = candidate
  }
  if (omitted) title = `${title.slice(0, MAX_TITLE_CHARS - 3)} +…`
  return title
}

/** Code Mode arguments needed to resolve a presentation and compaction title. */
export interface RunCodeTitleInput {
  readonly code: string
  readonly description?: string
}

/**
 * Resolve the stable title shared by the call card and durable projections.
 * @param input - recorded `run_code` arguments.
 * @returns the explicit non-blank description, a lexical title, or `Run code`.
 */
export function resolveRunCodeTitle(input: RunCodeTitleInput): string {
  const declared = input.description?.trim()
  return declared || inferRunCodeTitle(input.code) || 'Run code'
}
