/** Node-half coverage for the model guidance paired with Web file references. */

import { Context } from '@monotykamary/cordis'
import { afterEach, describe, expect, it } from 'vitest'
import SystemPrompt from '@monotykamary/dsh-system-prompt'
import ToolRuntime from '@monotykamary/dsh-tools'
import { apply, inject } from '../src/index.ts'

let ctx: Context | undefined

afterEach(async () => {
  await ctx?.fiber.dispose()
  ctx = undefined
})

describe('ui-deliverables node plugin', () => {
  it('registers final-response file-reference guidance only while mounted', async () => {
    ctx = new Context()
    await ctx.plugin(SystemPrompt, { persona: '' })
    await ctx.plugin(ToolRuntime)
    const mounted = ctx.plugin({ apply, inject }, { maxListItems: 50, maxDiffChars: 12_000 })
    await mounted.await()

    const section = (await ctx.systemPrompt.assemble()).sections
      .find(entry => entry.name === 'ui:deliverable-file-references')
    expect(section?.text).toMatchInlineSnapshot('"When you successfully create or modify files, mention the primary outputs in your final response. To make those and any other changed-file references clickable in Web, format them as Markdown inline code using the exact file-tool path, or a basename when unique among the files changed in that turn."')

    expect(ctx.tools.schemas().some(tool => tool.name === 'changes_read')).toBe(true)

    await mounted.dispose()
    expect(ctx.tools.schemas().some(tool => tool.name === 'changes_read')).toBe(false)
    expect((await ctx.systemPrompt.assemble()).sections
      .some(entry => entry.name === 'ui:deliverable-file-references')).toBe(false)
  })
})
