import { useSyncExternalStore } from 'react'

/** Follows a CSS media query, for layout decisions that cannot be made with classes alone. */
export const useMediaQuery = (query: string) =>
  useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query)
      list.addEventListener('change', onChange)
      return () => list.removeEventListener('change', onChange)
    },
    () => window.matchMedia(query).matches,
    () => false,
  )

/** The `md` breakpoint: where the sidebar stops being a drawer and tables stop squeezing. */
export const useIsDesktop = () => useMediaQuery('(min-width: 768px)')
