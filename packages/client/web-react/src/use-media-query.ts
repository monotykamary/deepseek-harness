/**
 * Subscribe one component to a CSS media query with live updates. driUnit-driven
 * through window.matchMedia change events — no resize polling, no width
 * arithmetic at render time. The first paint reflects the live value through
 * the sync-external-store contract, so drawer-type chrome never flashes the
 * wrong geometry at mount.
 */

import { useSyncExternalStore } from 'react'

/**
 * Subscribe to a media query.
 * @param query - full CSS media query, e.g. '(max-width: 767px)' or '(pointer: coarse)'.
 * @returns whether the media query currently matches.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onStoreChange) => {
      const list = window.matchMedia(query)
      list.addEventListener('change', onStoreChange)
      return () => { list.removeEventListener('change', onStoreChange) }
    },
    () => window.matchMedia(query).matches,
    () => false,
  )
}
