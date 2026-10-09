import { MoreHorizontal } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

export type HeaderMenuProps = { header: string; pinned: boolean; onTogglePin: () => void }

/** The "..." in a column header: for now, pinning the column to the left edge. */
export const HeaderMenu = ({ header, pinned, onTogglePin }: HeaderMenuProps) => {
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
    <div ref={root} className="relative ml-auto shrink-0">
      <button
        type="button"
        aria-label={`${header} column menu`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="relative inline-flex size-5 items-center justify-center rounded text-faint-foreground hover:bg-muted hover:text-foreground focus-visible:opacity-100 after:absolute after:-inset-2 after:content-[''] md:opacity-0 md:group-hover/cell:opacity-100 aria-expanded:opacity-100"
      >
        <MoreHorizontal className="size-3.5" />
      </button>
      {open && (
        <ul role="menu" className="absolute right-0 top-full z-30 mt-1 min-w-32 rounded-md border bg-background py-1 text-[13px] font-normal text-foreground shadow-pop">
          <li role="none">
            <button
              type="button"
              role="menuitem"
              className="block min-h-9 w-full whitespace-nowrap px-3 py-1.5 text-left hover:bg-muted"
              onClick={() => {
                setOpen(false)
                onTogglePin()
              }}
            >
              {pinned ? 'Unpin' : 'Pin to left'}
            </button>
          </li>
        </ul>
      )}
    </div>
  )
}
