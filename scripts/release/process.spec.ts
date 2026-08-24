import { describe, expect, it } from 'vitest'
import { capture } from './process.ts'

describe('release process capture', () => {
  it("captures npm-scale output beyond Node's one-megabyte default", () => {
    const bytes = 2 * 1024 * 1024
    const output = capture(process.execPath, ['-e', `process.stdout.write('x'.repeat(${String(bytes)}))`])
    expect(output).toHaveLength(bytes)
  })
})
