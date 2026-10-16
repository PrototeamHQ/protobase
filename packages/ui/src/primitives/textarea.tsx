import { useEffect, useLayoutEffect, useRef, type TextareaHTMLAttributes } from 'react'
import { cn } from '../lib/cn'

export type TextareaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value'> & { value: string; invalid?: boolean }

// As tall as its text, at least its rows, borders included: the page scrolls, never the box.
const fit = (box: HTMLTextAreaElement) => {
  box.style.height = 'auto'
  box.style.height = `${box.scrollHeight + box.offsetHeight - box.clientHeight}px`
}

/** A text box of several lines that grows with its text instead of scrolling inside. */
export const Textarea = ({ invalid, className, rows = 3, value, ...rest }: TextareaProps) => {
  const ref = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    if (ref.current) fit(ref.current)
  }, [value])
  // A narrower box wraps the text onto more lines
  useEffect(() => {
    const box = ref.current
    if (!box) return
    let width = box.clientWidth
    const observer = new ResizeObserver(() => {
      if (box.clientWidth === width) return
      width = box.clientWidth
      fit(box)
    })
    observer.observe(box)
    return () => observer.disconnect()
  }, [])
  return (
    <textarea
      ref={ref}
      rows={rows}
      value={value}
      className={cn(
        'block w-full resize-none overflow-hidden rounded-md border bg-background px-2.5 py-1.5 text-body text-foreground shadow-sm outline-none placeholder:text-faint-foreground focus:border-primary focus:ring-2 focus:ring-primary/20',
        invalid ? 'border-danger' : 'border-border-strong',
        className,
      )}
      {...rest}
    />
  )
}
