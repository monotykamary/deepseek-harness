/**
 * Deliverables plugin, node half. Registers the response-format guidance that
 * lets the browser half recognize final-response file references. The browser
 * half ships through `exports["./client"]`.
 */

import type { Context } from '@monotykamary/cordis'
import type {} from '@monotykamary/dsh-system-prompt'

/** Service required for model guidance paired with the browser renderer. */
export const inject = ['systemPrompt']

const FILE_REFERENCE_PROMPT = 'When you successfully create or modify files, mention the primary outputs in your final response. '
  + 'To make those and any other changed-file references clickable in Web, format them as Markdown inline code using the exact file-tool path, or a basename when unique among the files changed in that turn.'

/**
 * Register model guidance for the file-reference renderer shipped by this package.
 * @param ctx - Host context carrying the system-prompt registry.
 */
export function apply(ctx: Context): void {
  ctx.systemPrompt.section({
    name: 'ui:deliverable-file-references',
    order: 190,
    text: FILE_REFERENCE_PROMPT,
  })
}
