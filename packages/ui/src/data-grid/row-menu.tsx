import { MoreHorizontal } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '../lib/cn'
import type { GridRow } from './column-spec'

/** `available` hides the action for rows it does not apply to, for example a delete the server will refuse. */
export type RowAction = { label: string; destructive?: boolean; available?: (row: GridRow) => boolean; onSelect: (row: GridRow) => void }

/** The actions that apply to a row; a row with none gets no menu at all. */
export const availableActions = (actions: RowAction[], row: GridRow) => actions.filter((action) => action.available?.(row) ?? true)

const gap = 4

/** Below the button, or above it when the viewport has no room underneath. */
const placeMenu = (button: DOMRect, menuHeight: number) => {
  const below = button.bottom + gap
  const top = below + menuHeight > window.innerHeight - gap ? Math.max(gap, button.top - gap - menuHeight) : below
  return { top, right: window.innerWidth - button.right }
}

/**
 * The "..." button at the end of a row, with a small menu of the row's actions. The menu is portalled to the body:
 * every grid row is its own stacking context and the grid body clips, so a menu inside the row would sit under the
 * rows below it.
 */
export const RowMenu = ({ row, actions }: { row: GridRow; actions: RowAction[] }) => {
  const [open, setOpen] = useState(false)
  const [place, setPlace] = useState<{ top: number; right: number }>()
  const button = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLUListElement>(null)

  useLayoutEffect(() => {
    if (!open || !button.current || !menu.current) {
      setPlace(undefined)
      return
    }
    setPlace(placeMenu(button.current.getBoundingClientRect(), menu.current.offsetHeight))
  }, [open])

  useEffect(() => {
    if (!open) return
    const inside = (target: EventTarget | null) => button.current?.contains(target as Node) || menu.current?.contains(target as Node)
    const close = (event: Event) => {
      if (event instanceof KeyboardEvent ? event.key === 'Escape' : !inside(event.target)) setOpen(false)
    }
    // A fixed menu would drift away from its row
    const dismiss = () => setOpen(false)
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    document.addEventListener('scroll', dismiss, true)
    window.addEventListener('resize', dismiss)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', close)
      document.removeEventListener('scroll', dismiss, true)
      window.removeEventListener('resize', dismiss)
    }
  }, [open])

  return (
    <div className="relative flex justify-center bg-inherit" onClick={(event) => event.stopPropagation()}>
      <button ref={button} type="button" aria-label="Row actions" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)} className="inline-flex items-center justify-center rounded p-1 text-faint-foreground hover:bg-muted hover:text-foreground pointer-coarse:size-11">
        <MoreHorizontal className="size-4" />
      </button>
      {open &&
        createPortal(
          <ul ref={menu} role="menu" onClick={(event) => event.stopPropagation()} style={place ?? { visibility: 'hidden' }} className="fixed z-50 min-w-36 rounded-md border bg-background py-1 text-[13px] shadow-pop">
            {actions.map((action) => (
              <li key={action.label} role="none">
                <button
                  type="button"
                  role="menuitem"
                  className={cn('block w-full px-3 py-1.5 text-left hover:bg-muted', action.destructive && 'text-danger-text')}
                  onClick={() => {
                    setOpen(false)
                    action.onSelect(row)
                  }}
                >
                  {action.label}
                </button>
              </li>
            ))}
          </ul>,
          document.body,
        )}
    </div>
  )
}
