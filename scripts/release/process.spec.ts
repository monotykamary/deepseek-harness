import { describe, expect, it } from 'vitest'
import { capture } from './process.ts'

describe('release process capture', () => {
  it("captures npm-scale output beyond Node's one-megabyte default", () => {
    const bytes = 2 * 1024 * 1024
    const output = capture(process.execPath, ['-e', `process.stdout.write('x'.repeat(${String(bytes)}))`])
    expect(output).toHaveLength(bytes)
  })

  it('bounds a stalled command and retains its diagnostics', () => {
    expect(() => capture(process.execPath, [
      '-e', "process.stdout.write('started'); setInterval(() => {}, 1_000)",
    ], { timeoutMs: 100 })).toThrow(/ETIMEDOUT[\s\S]*started/u)
  })
})
