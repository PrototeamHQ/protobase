import { useEffect, useRef } from 'react'

/**
 * The address of the history entry behind the page shown, as far as the shell saw the person get here: each forward
 * navigation stacks the address left; a step back (popstate) to the entry behind takes it off; any other step, such as
 * forward or several at once, starts again from here, with nothing known behind. Nothing in history is changed.
 */
export const useEntryBehind = () => {
  const here = typeof window === 'undefined' ? '' : `${window.location.pathname}${window.location.search}`
  const visited = useRef<string[]>([])
  const popped = useRef(false)

  useEffect(() => {
    const onPop = () => {
      popped.current = true
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  useEffect(() => {
    const stack = visited.current
    if (stack.at(-1) === here) return
    if (popped.current) stack.splice(0, stack.length, ...(stack.at(-2) === here ? stack.slice(0, -1) : [here]))
    else stack.push(here)
    popped.current = false
  }, [here])

  const stack = visited.current
  return stack.at(-1) === here ? stack.at(-2) : stack.at(-1)
}
