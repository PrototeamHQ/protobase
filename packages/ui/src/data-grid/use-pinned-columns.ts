import { useCallback, useState } from 'react'
import { readPinned, writePinned } from './pinned-storage'

/**
 * The ids of the columns pinned to the left, in pin order. With a `storageKey` the choice is kept in local storage
 * (per user and resource); `initial` applies until the user has chosen.
 */
export const usePinnedColumns = (storageKey: string | undefined, initial: string[] = []) => {
  const [pinned, setPinned] = useState(() => (storageKey ? readPinned(localStorage, storageKey) : undefined) ?? initial)
  const update = useCallback(
    (next: string[]) => {
      setPinned(next)
      if (storageKey) writePinned(localStorage, storageKey, next)
    },
    [storageKey],
  )
  return [pinned, update] as const
}
