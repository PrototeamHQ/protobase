import { MoreHorizontal } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { cn } from '../lib/cn'

export type LineMenuItem = { label: string; disabled?: boolean; destructive?: boolean; onSelect: () => void }

/** The "..." at the end of a line: the keyboard-and-screen-reader way to reorder, besides the drag handle. */
export const LineMenu = ({ items, label }: { items: LineMenuItem[]; label: string }) => {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (event: Event) => {
      if (event instanceof KeyboardEvent ? event.key === 'Escape' : !root.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', close)
    }
  }, [open])

  return (
    <div ref={root} className="relative flex justify-center">
      <button
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="inline-flex size-7 items-center justify-center rounded text-faint-foreground hover:bg-muted hover:text-foreground pointer-coarse:size-11"
      >
        <MoreHorizontal className="size-4" />
      </button>
      {open && (
        <ul role="menu" className="absolute right-0 top-full z-30 mt-1 min-w-36 rounded-md border bg-background py-1 text-[13px] shadow-pop">
          {items.map((item) => (
            <li key={item.label} role="none">
              <button
                type="button"
                role="menuitem"
                disabled={item.disabled}
                className={cn('block min-h-9 w-full whitespace-nowrap px-3 py-1.5 text-left hover:bg-muted disabled:text-faint-foreground disabled:hover:bg-transparent', item.destructive && 'text-danger-text')}
                onClick={() => {
                  setOpen(false)
                  item.onSelect()
                }}
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
