/** T3-adapted conversation palette, geometry, density, and interaction contracts. */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const read = (relative: string): string => readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8')
const themeCss = read('../../ui-theme/src/styles/design-platform.css')
const rootCss = read('../src/client/skeleton/ConversationRoot.module.css')
const inputCss = read('../src/client/skeleton/InputBar.module.css')
const chatCss = read('../src/client/chat/ChatView.module.css')
const messageCss = read('../src/client/chat/MessageItem.module.css')
const assistantCss = read('../src/client/chat/AssistantMarkdown.module.css')
const tailCss = read('../src/client/chat/TurnTailNodeView.module.css')
const actionsCss = read('../src/client/chat/MessageIconActions.module.css')
const contextCss = read('../src/client/chat/ContextInjectionRow.module.css')
const detailsCss = read('../src/client/skeleton/DetailsPanel.module.css')
const codeBlockCss = read('../../ui-primitives/src/markdown/CodeBlock.module.css')

/**
 * Declarations of one selector rule, keyed by property with whitespace collapsed.
 * @param source - CSS source containing the selector.
 * @param selector - Exact selector, including a leading dot for local classes.
 * @returns normalized declarations, or undefined when the selector is absent.
 */
function declarationsFrom(source: string, selector: string): Map<string, string> | undefined {
  const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, ' ')
  const found = new Map<string, string>()
  for (const [, selectorList = '', body = ''] of withoutComments.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!selectorList.split(',').map(value => value.trim()).includes(selector)) continue
    for (const part of body.split(';')) {
      const colon = part.indexOf(':')
      if (colon === -1) continue
      found.set(part.slice(0, colon).trim(), part.slice(colon + 1).trim().replace(/\s+/g, ' '))
    }
  }
  return found.size === 0 ? undefined : found
}

const root = (selector: string): Map<string, string> | undefined => declarationsFrom(rootCss, selector)
const input = (selector: string): Map<string, string> | undefined => declarationsFrom(inputCss, selector)
const chat = (selector: string): Map<string, string> | undefined => declarationsFrom(chatCss, selector)
const message = (selector: string): Map<string, string> | undefined => declarationsFrom(messageCss, selector)
const assistant = (selector: string): Map<string, string> | undefined => declarationsFrom(assistantCss, selector)
const tail = (selector: string): Map<string, string> | undefined => declarationsFrom(tailCss, selector)
const actions = (selector: string): Map<string, string> | undefined => declarationsFrom(actionsCss, selector)
const context = (selector: string): Map<string, string> | undefined => declarationsFrom(contextCss, selector)
const details = (selector: string): Map<string, string> | undefined => declarationsFrom(detailsCss, selector)
const codeBlock = (selector: string): Map<string, string> | undefined => declarationsFrom(codeBlockCss, selector)

const paletteRoles = [
  '--dsw-specific-conversation-canvas',
  '--dsw-specific-conversation-message',
  '--dsw-specific-conversation-divider',
  '--dsw-specific-conversation-composer-surface',
  '--dsw-specific-conversation-composer-outline',
  '--dsw-specific-conversation-composer-highlight',
  '--dsw-specific-conversation-composer-shadow',
  '--dsw-specific-conversation-glass-blur',
  '--dsw-specific-conversation-glass-saturation',
]

const sharedRoles = [
  '--dsw-specific-conversation-prose',
  '--dsw-specific-conversation-glass-opacity',
]

describe('T3-adapted conversation styles', () => {
  it('declares palette roles and consumes every role from conversation CSS', () => {
    const consumers = rootCss + inputCss + chatCss + messageCss + assistantCss + tailCss
    for (const role of paletteRoles) {
      expect(themeCss.match(new RegExp(`${role}:`, 'g'))).toHaveLength(2)
      expect(consumers + themeCss).toContain(`var(${role})`)
    }
    for (const role of sharedRoles) {
      expect(themeCss.match(new RegExp(`${role}:`, 'g'))).toHaveLength(1)
      expect(consumers).toContain(`var(${role})`)
    }
    expect(themeCss).toContain("Conversation roles adapt T3 Code's")
  })

  it('scopes the T3 canvas and 52px title rhythm to the conversation', () => {
    expect(root('.root')?.get('background')).toBe('var(--dsw-specific-conversation-canvas)')
    expect(root('.header')?.get('gap')).toBe('10px')
    expect(root('.header')?.get('padding')).toBe('10px 20px 0')
    expect(root('.header')?.get('background')).toBe('var(--dsw-specific-conversation-canvas)')
    expect(root('.header::after')?.get('background')).toBe('var(--dsw-specific-conversation-divider)')
    expect(root('.titleRow')?.get('min-height')).toBe('32px')
    expect(root('.titleRow')?.get('gap')).toBe('20px')
    expect(root('.tabs')?.has('margin-top')).toBe(false)
    expect(rootCss).toContain('var(--dsw-specific-conversation-canvas) 36px')
    expect(root('.root')?.get('--dsh-conversation-top-fade-height')).toBe('20px')
    expect(chatCss).toContain('rgb(0 0 0) var(--dsh-conversation-top-fade-height)')
  })

  it('renders the existing composer as T3 glass without changing its width axis', () => {
    const card = input('.card')
    expect(card?.get('max-width')).toBe('var(--dsh-composer-card-max-width)')
    expect(card?.get('border')).toBe('1px solid var(--dsw-specific-conversation-composer-outline)')
    expect(card?.get('border-radius')).toBe('22px')
    expect(card?.get('background')).toContain('var(--dsw-specific-conversation-composer-surface)')
    expect(card?.get('background')).toContain('var(--dsw-specific-conversation-glass-opacity)')
    expect(card?.get('-webkit-backdrop-filter')).toContain('var(--dsw-specific-conversation-glass-blur)')
    expect(card?.get('backdrop-filter')).toContain('var(--dsw-specific-conversation-glass-saturation)')
    expect(card?.get('box-shadow')).toBe('var(--dsw-specific-conversation-composer-shadow)')
  })

  it('uses the adapted message density and parent-owned transcript spacing', () => {
    expect(chat('.column')?.get('gap')).toBe('12px')
    expect(message('.userStack')?.get('max-width')).toBe('80%')
    expect(message('.bubble')?.get('background')).toBe('var(--dsw-specific-conversation-message)')
    expect(message('.bubble')?.get('border-radius')).toBe('16px')
    expect(message('.bubble')?.get('padding')).toBe('12px')
    expect(message('.bubble')?.get('font-size')).toBe('15px')
    expect(message('.bubble')?.get('line-height')).toBe('24px')
    expect(assistant('.root')?.get('font-size')).toBe('15px')
    expect(assistant('.root')?.get('line-height')).toBe('24px')
    expect(assistant('.root')?.get('color')).toBe('var(--dsw-specific-conversation-prose)')
    expect(assistant('.body')?.get('gap')).toBe('12px')
    expect(tail('.root')?.get('gap')).toBe('8px')
  })

  it('lets compact transcript metadata shrink without establishing a chat width floor', () => {
    expect(actions('.actions')?.get('min-width')).toBe('0')
    expect(actions('.actions')?.get('max-width')).toBe('100%')
    for (const selector of ['.timeStart', '.timeEnd']) {
      expect(actions(selector)?.get('flex')).toBe('0 1 auto')
      expect(actions(selector)?.get('min-width')).toBe('0')
      expect(actions(selector)?.get('overflow')).toBe('hidden')
      expect(actions(selector)?.get('text-overflow')).toBe('ellipsis')
    }
    expect(context('.source')?.get('flex')).toBe('0 1 auto')
  })

  it('pins inspector code banners over the scrollport padding without exposing source above them', () => {
    expect(codeBlock('.bannerWrap')?.get('top')).toBe('var(--dsl-code-block-sticky-top, 0)')
    expect(details('.body')?.get('padding')).toBe('12px 16px')
    expect(details('.body')?.get('--dsl-code-block-sticky-top')).toBe('-12px')
  })

  it('reveals message actions only through hover or keyboard focus on fine pointers', () => {
    expect(messageCss).toContain('@media (hover: hover) and (pointer: fine)')
    expect(messageCss).toMatch(/\.actions\s*\{\s*opacity: 0;/)
    expect(messageCss).toContain('.userRow:is(:hover, :focus-within) .actions')
    expect(tailCss).toContain('opacity: var(--dsh-message-actions-opacity, 0)')
    expect(tailCss).toContain('.root:is(:hover, :focus-within) .actions')
    expect(chatCss).toContain(".flowItem[data-chat-flow-kind='assistant-step']:is(:hover, :focus-within)")
  })
})
