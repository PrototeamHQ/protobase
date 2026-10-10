import { useEffect, useState } from 'react'

export type ViewportBox = { top: number; height: number }

/**
 * While `active`: the part of the page that is on screen, which shrinks when a phone's on-screen keyboard opens;
 * undefined otherwise, or where the browser has no `visualViewport`.
 */
export const useVisualViewport = (active: boolean) => {
  const [box, setBox] = useState<ViewportBox>()
  useEffect(() => {
    const viewport = window.visualViewport
    if (!active || !viewport) return setBox(undefined)
    const update = () => setBox({ top: viewport.offsetTop, height: viewport.height })
    update()
    viewport.addEventListener('resize', update)
    viewport.addEventListener('scroll', update)
    return () => {
      viewport.removeEventListener('resize', update)
      viewport.removeEventListener('scroll', update)
    }
  }, [active])
  return active ? box : undefined
}
