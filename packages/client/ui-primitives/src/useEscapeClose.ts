import { useEffect } from 'react'

/**
 * Bind Escape dismissal for one controlled overlay while it is open.
 * @param open - whether the overlay currently accepts dismissal.
 * @param onClose - owner callback invoked for Escape.
 */
export function useEscapeClose(open: boolean, onClose: () => void): void {
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => { document.removeEventListener('keydown', onKeyDown) }
  }, [open, onClose])
}
