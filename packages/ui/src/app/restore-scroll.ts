/** How long a page may take to grow tall enough, as while its data loads, before it is left where it is. */
const patience = 3000

/**
 * Scrolls the document to `top`. A page still too short for it, as one whose data is loading, is scrolled again each
 * time it grows, until it is there, a few seconds pass, or anything else scrolls it: the person, or a list that brings
 * itself back to its place. Returns how to stop early.
 */
export const restoreScroll = (top: number) => {
  let placed = 0
  const place = () => {
    window.scrollTo({ top, behavior: 'instant' })
    placed = window.scrollY
    return placed >= top - 1
  }
  if (place()) return () => {}
  const observer = new ResizeObserver(() => place() && stop())
  const moved = () => Math.abs(window.scrollY - placed) > 1 && stop()
  const stop = () => {
    observer.disconnect()
    clearTimeout(timer)
    window.removeEventListener('scroll', moved)
  }
  const timer = setTimeout(stop, patience)
  observer.observe(document.body)
  window.addEventListener('scroll', moved, { passive: true })
  return stop
}
