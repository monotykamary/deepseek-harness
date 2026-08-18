/** Trajectory clearance from the conversation-owned progressive top fade. */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const source = readFileSync(fileURLToPath(new URL('../src/client/views.module.css', import.meta.url)), 'utf8')

describe('Trajectory viewport styles', () => {
  it('starts the toolbar below the shared conversation fade band', () => {
    expect(source).toContain('padding-top: var(--dsh-conversation-top-fade-height, 20px)')
  })
})
