import { useEffect, useLayoutEffect, useRef } from 'react'
import { awaitTerminalFontReady } from './font-readiness.ts'
import type { TerminalPreferences } from './preferences.ts'
import { XtermSurface } from './xterm-surface.ts'
import { terminalTheme } from './themes.ts'
import type { TerminalDimensions } from './xterm-surface.ts'
import css from './TerminalViewport.module.css'

/** Props for the stable xterm DOM viewport. */
export interface TerminalViewportProps {
  readonly preferences: TerminalPreferences
  readonly onReady: (surface: XtermSurface) => void
  readonly onInput: (input: string) => void
  readonly onResize: (dimensions: TerminalDimensions) => void
  /** Layout-owned bottom-panel height; an opening transition forces a post-layout refit. */
  readonly layoutHeight?: number
}

function heightTransitionOwner(container: HTMLElement): HTMLElement | undefined {
  for (let element = container.parentElement; element !== null; element = element.parentElement) {
    const style = getComputedStyle(element)
    const properties = style.transitionProperty.split(',').map(value => value.trim())
    const durations = style.transitionDuration.split(',').map(value => Number.parseFloat(value))
    const index = properties.findIndex(property => property === 'height')
    if (index >= 0 && (durations[index % durations.length] ?? 0) > 0) return element
  }
  return undefined
}

/** Mount one xterm surface and refit it as its panel changes width or height. */
export function TerminalViewport({
  preferences, onReady, onInput, onResize, layoutHeight,
}: TerminalViewportProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const surfaceRef = useRef<XtermSurface | null>(null)
  const inputRef = useRef(onInput)
  const resizeRef = useRef(onResize)
  const readyRef = useRef(false)
  inputRef.current = onInput
  resizeRef.current = onResize

  useLayoutEffect(() => {
    const container = containerRef.current
    if (container === null) return
    const surface = new XtermSurface(container, preferences, (input) => { inputRef.current(input) })
    surfaceRef.current = surface
    const transitionOwner = layoutHeight === undefined ? undefined : heightTransitionOwner(container)
    const publishReady = (): void => {
      const dimensions = surface.fit()
      if (dimensions !== undefined) resizeRef.current(dimensions)
      if (!readyRef.current) {
        readyRef.current = true
        onReady(surface)
      }
    }
    if (layoutHeight === undefined || layoutHeight > 0) publishReady()
    const observer = new ResizeObserver(() => {
      const next = surface.fit()
      if (next !== undefined) resizeRef.current(next)
      const transitionTarget = Number.parseFloat(transitionOwner?.style.height ?? '')
      const transitionSettled = transitionOwner !== undefined
        && transitionTarget > 0
        && transitionOwner.clientHeight >= transitionTarget
      if (!readyRef.current && next !== undefined
        && (transitionSettled || (transitionOwner === undefined && container.clientHeight > 0))) {
        readyRef.current = true
        onReady(surface)
      }
    })
    const onTransitionEnd = (event: TransitionEvent): void => {
      if (event.propertyName === 'height') publishReady()
    }
    transitionOwner?.addEventListener('transitionend', onTransitionEnd)
    transitionOwner?.addEventListener('transitioncancel', onTransitionEnd)
    observer.observe(container)
    if (container.parentElement !== null) observer.observe(container.parentElement)
    const screen = container.querySelector('.xterm-screen')
    if (screen !== null) observer.observe(screen)
    return () => {
      observer.disconnect()
      transitionOwner?.removeEventListener('transitionend', onTransitionEnd)
      transitionOwner?.removeEventListener('transitioncancel', onTransitionEnd)
      surfaceRef.current = null
      surface.dispose()
    }
  }, [])

  useEffect(() => {
    const surface = surfaceRef.current
    if (surface === null) return
    let cancelled = false
    surface.apply(preferences)
    const visible = layoutHeight === undefined || layoutHeight > 0
    if (visible) {
      const dimensions = surface.fit()
      if (dimensions !== undefined) resizeRef.current(dimensions)
    }
    void awaitTerminalFontReady(preferences).then(() => {
      if (cancelled) return
      surface.refreshFontMetrics()
      if (visible) {
        const readyDimensions = surface.fit()
        if (readyDimensions !== undefined) resizeRef.current(readyDimensions)
      }
    })
    return () => { cancelled = true }
  }, [preferences])


  const background = terminalTheme(preferences.theme).background ?? '#000000'
  return (
    <div
      className={css.viewport}
      style={{ backgroundColor: background }}
      data-terminal-viewport=""
      data-terminal-font={preferences.font}
      data-terminal-ligatures={preferences.ligatures}
    >
      <div ref={containerRef} className={css.surface} />
    </div>
  )
}
