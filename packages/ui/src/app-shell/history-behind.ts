import { useEffect, useRef } from 'react'

/**
 * The addresses visited, the last one shown, once the page is at `here`: a forward navigation stacks it; a step back
 * (`popped`) to the entry behind takes the last one off; any other step, such as forward or several at once, starts
 * again from `here`, with nothing known behind.
 */
export const visitedAfter = (stack: string[], here: string, popped: boolean): string[] => {
  if (stack.at(-1) === here) return stack
  if (!popped) return [...stack, here]
  return stack.at(-2) === here ? stack.slice(0, -1) : [here]
}

/**
 * The address of the history entry behind the page shown, as far as the shell saw the person get here (`visitedAfter`).
 * It is worked out in the render that shows the page, so a step back answers with the entry behind the page it lands
 * on, not the one it left. Nothing in history is changed.
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

  const stack = visitedAfter(visited.current, here, popped.current)
  useEffect(() => {
    visited.current = visitedAfter(visited.current, here, popped.current)
    popped.current = false
  }, [here])

  return stack.at(-2)
}
