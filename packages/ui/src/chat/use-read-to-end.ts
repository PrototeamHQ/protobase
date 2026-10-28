import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'

/**
 * Tells `onReadToEnd` that the reader is at the end of a chat, but only while the page shows: the returned function
 * tells it now, and the page becoming visible again tells it when `atEnd()` holds then. Call it before the layout
 * effects that tell, so they tell the latest `onReadToEnd`.
 */
export const useReadToEnd = (onReadToEnd: (() => void) | undefined, atEnd: () => boolean) => {
  const latest = useRef({ onReadToEnd, atEnd })
  useLayoutEffect(() => {
    latest.current = { onReadToEnd, atEnd }
  })
  const tell = useCallback(() => {
    if (document.visibilityState === 'visible') latest.current.onReadToEnd?.()
  }, [])

  useEffect(() => {
    const shown = () => {
      if (latest.current.atEnd()) tell()
    }
    document.addEventListener('visibilitychange', shown)
    return () => document.removeEventListener('visibilitychange', shown)
  }, [tell])

  return tell
}
