import { useSyncExternalStore } from 'react'

const rootFontSize = () => parseFloat(getComputedStyle(document.documentElement).fontSize)

/** The root text size in pixels, what `1rem` is, read again on a resize of the window such as a zoom. */
export const useRootFontSize = () =>
  useSyncExternalStore(
    (onChange) => {
      window.addEventListener('resize', onChange)
      return () => window.removeEventListener('resize', onChange)
    },
    rootFontSize,
    () => 16,
  )
