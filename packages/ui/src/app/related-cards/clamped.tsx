import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Button } from '../../primitives/button'
import { cn } from '../../lib/cn'
import { text } from './messages'

/**
 * Its content cut off at a few lines' height with "Show more" under it when it is taller, which shows it all; the cut
 * hides the rest rather than scrolling it, so the page keeps its one scrollbar.
 */
export const Clamped = ({ children }: { children: ReactNode }) => {
  const content = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [taller, setTaller] = useState(false)
  // Markdown renders once its renderer loads, so the height is measured again whenever the content resizes, and on closing
  useLayoutEffect(() => {
    const box = content.current
    if (!box) return
    const measure = () => setTaller(box.scrollHeight > box.parentElement!.clientHeight + 1)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(box)
    return () => observer.disconnect()
  }, [open])
  return (
    <div className="flex flex-col items-start gap-1">
      <div className={cn('w-full min-w-0', !open && 'max-h-40 overflow-hidden')}>
        <div ref={content}>{children}</div>
      </div>
      {(taller || open) && (
        <Button size="sm" variant="ghost" className="-ml-2" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? text('showLess') : text('showMore')}
        </Button>
      )}
    </div>
  )
}
