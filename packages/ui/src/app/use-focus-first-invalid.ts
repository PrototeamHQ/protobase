import { useEffect, useRef } from 'react'

/**
 * Puts focus on the first control marked invalid inside the element the ref is on, each time `rejections` counts
 * another save the server turned down, once the form shows why, such as after the page moves to the tab that holds it.
 */
export const useFocusFirstInvalid = <T extends HTMLElement>(rejections: number) => {
  const ref = useRef<T>(null)
  const pending = useRef(false)
  useEffect(() => {
    if (rejections > 0) pending.current = true
  }, [rejections])
  useEffect(() => {
    if (!pending.current) return
    const invalid = ref.current?.querySelector<HTMLElement>('[aria-invalid="true"]')
    if (!invalid) return
    invalid.focus()
    pending.current = false
  })
  return ref
}
