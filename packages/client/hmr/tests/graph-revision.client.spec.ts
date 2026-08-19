import { describe, expect, it } from 'vitest'
import { graphRevisionChanged } from '../src/client/index.ts'

describe('client HMR graph revision', () => {
  it('reloads only when a validated boot revision differs from the reconnect snapshot', () => {
    expect(graphRevisionChanged('old', 'new')).toBe(true)
    expect(graphRevisionChanged('same', 'same')).toBe(false)
    expect(graphRevisionChanged(undefined, 'new')).toBe(false)
  })
})
