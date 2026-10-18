import { useCallback, useState } from 'react'
import { readPinned, writePinned } from './pinned-storage'

/**
 * The ids of the columns pinned to the left, in pin order. With a `storageKey` the choice is kept in local storage
 * (per user and resource); `initial` applies until the user has chosen, as it is on each render.
 */
export const usePinnedColumns = (storageKey: string | undefined, initial: string[] = []) => {
  const [chosen, setChosen] = useState(() => (storageKey ? readPinned(localStorage, storageKey) : undefined))
  const update = useCallback(
    (next: string[]) => {
      setChosen(next)
      if (storageKey) writePinned(localStorage, storageKey, next)
    },
    [storageKey],
  )
  return [chosen ?? initial, update] as const
}
