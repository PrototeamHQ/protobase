import { useCallback, useState } from 'react'
import type { ViewModel } from '@protobase/schema'
import { useIsXs } from '../../lib/use-media-query'
import { embeddedDisplay, embeddedDisplayKey, readPickedDisplay, writePickedDisplay } from './embedded-display'

/**
 * The display an embedded list shows and the way to pick another, which is kept in local storage for the viewer under
 * `place`, the list's place in the app.
 */
export const useEmbeddedDisplay = (view: ViewModel | undefined, place: string, preferred?: string) => {
  const xs = useIsXs()
  const key = embeddedDisplayKey(place)
  const [picked, setPicked] = useState(() => readPickedDisplay(localStorage, key))
  const pick = useCallback(
    (display: string) => {
      setPicked(display)
      writePickedDisplay(localStorage, key, display)
    },
    [key],
  )
  return [embeddedDisplay(view, xs, { picked, preferred }), pick] as const
}
