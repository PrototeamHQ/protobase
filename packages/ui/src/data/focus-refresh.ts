import { createContext, useContext, useEffect } from 'react'

/**
 * Whether the data on screen refetches when the window regains focus: always, unless a form on screen holds unsaved
 * changes. A refetch under such a form would hand it a newer version of the record without the changes it was edited
 * from, so its Save would no longer find a conflict.
 */
export const createFocusRefresh = () => {
  let paused = 0
  return {
    refetchOnWindowFocus: () => (paused > 0 ? false : ('always' as const)),
    /** Whether a form on screen holds unsaved changes, so its record must not be read again under it. */
    paused: () => paused > 0,
    /** Holds the refetches until the returned function is called. */
    pause: () => {
      paused += 1
      let released = false
      return () => {
        if (released) return
        released = true
        paused -= 1
      }
    },
  }
}

export type FocusRefresh = ReturnType<typeof createFocusRefresh>

export const FocusRefreshContext = createContext<FocusRefresh | null>(null)

/** Holds the app's refetches on window focus while `paused`, such as while a form has unsaved changes. */
export const usePauseFocusRefresh = (paused: boolean) => {
  const refresh = useContext(FocusRefreshContext)
  useEffect(() => (paused && refresh ? refresh.pause() : undefined), [paused, refresh])
}

/**
 * Tells TanStack Query the window regained focus on a return to the browser tab, as by default, and on a return to the
 * browser window from another program, which leaves the tab visible.
 */
export const listenToWindowFocus = (onFocus: (focused?: boolean) => void) => {
  const listener = () => onFocus()
  window.addEventListener('visibilitychange', listener, false)
  window.addEventListener('focus', listener, false)
  return () => {
    window.removeEventListener('visibilitychange', listener)
    window.removeEventListener('focus', listener)
  }
}
