import { useEffect, useRef } from 'react'

/**
 * Puts focus on the first control marked invalid inside the element the ref is on, each time `rejections` counts
 * another save the server turned down, once the form shows why.
 */
export const useFocusFirstInvalid = <T extends HTMLElement>(rejections: number) => {
  const ref = useRef<T>(null)
  useEffect(() => {
    if (rejections === 0) return
    ref.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
  }, [rejections])
  return ref
}
