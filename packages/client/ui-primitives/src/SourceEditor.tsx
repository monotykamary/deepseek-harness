import { useMemo, useRef, useSyncExternalStore } from 'react'
import type { ChangeEvent, KeyboardEvent, UIEvent } from 'react'
import {
  grammarLoadCount, highlightLines, subscribeGrammarLoaded, type HighlightSpan,
} from './markdown/highlight.ts'
import css from './SourceEditor.module.css'

export interface SourceEditorProps {
  /** Complete UTF-8 source value controlled by the owner. */
  value: string
  /** Accessible editor label naming the current file. */
  ariaLabel: string
  /** Grammar hint derived from the file extension; unknown values render plain text. */
  lang?: string | undefined
  /** Whether text mutation is disabled while selection and scrolling remain available. */
  readOnly?: boolean | undefined
  /** Receive the complete next source value after an edit. */
  onChange: (value: string) => void
  /** Optional save gesture invoked by Ctrl/Cmd+S. */
  onSave?: (() => void) | undefined
}

function renderSpans(spans: readonly HighlightSpan[]) {
  return spans.map((span, index) => <span key={index} style={span.style}>{span.text}</span>)
}

/**
 * Render a controlled, line-numbered textarea over the shared Shiki token stream.
 * @param props - controlled source, grammar, accessibility, mutation, and save callbacks.
 * @returns one native textarea editor with an aria-hidden highlighted backdrop.
 */
export function SourceEditor({
  value, ariaLabel, lang, readOnly = false, onChange, onSave,
}: SourceEditorProps) {
  const textarea = useRef<HTMLTextAreaElement>(null)
  const backdrop = useRef<HTMLDivElement>(null)
  const loaded = useSyncExternalStore(subscribeGrammarLoaded, grammarLoadCount, grammarLoadCount)
  const highlighted = useMemo(() => highlightLines(value, lang), [value, lang, loaded])
  const lines = useMemo(() => value.split('\n'), [value])

  const syncScroll = (event: UIEvent<HTMLTextAreaElement>): void => {
    if (backdrop.current === null) return
    backdrop.current.scrollTop = event.currentTarget.scrollTop
    backdrop.current.scrollLeft = event.currentTarget.scrollLeft
  }

  const change = (event: ChangeEvent<HTMLTextAreaElement>): void => {
    onChange(event.currentTarget.value)
  }

  const keyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === 's') {
      if (onSave === undefined) return
      event.preventDefault()
      onSave()
      return
    }
    if (readOnly || event.key !== 'Tab' || event.metaKey || event.ctrlKey || event.altKey) return
    event.preventDefault()
    const start = event.currentTarget.selectionStart
    const end = event.currentTarget.selectionEnd
    const next = `${value.slice(0, start)}\t${value.slice(end)}`
    onChange(next)
    requestAnimationFrame(() => {
      textarea.current?.setSelectionRange(start + 1, start + 1)
    })
  }

  return (
    <div className={css.root} data-source-editor="">
      <div ref={backdrop} className={css.backdrop} aria-hidden="true">
        <div className={css.backdropContent}>
          {lines.map((line, index) => (
            <div key={index} className={css.line}>
              <span className={css.gutter}>{index + 1}</span>
              <span className={css.content}>
                {highlighted?.[index] === undefined ? line : renderSpans(highlighted[index])}
                {line.length === 0 && <span>&#8203;</span>}
              </span>
            </div>
          ))}
        </div>
      </div>
      <textarea
        ref={textarea}
        className={css.input}
        aria-label={ariaLabel}
        value={value}
        readOnly={readOnly}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        wrap="off"
        onChange={change}
        onKeyDown={keyDown}
        onScroll={syncScroll}
      />
    </div>
  )
}
