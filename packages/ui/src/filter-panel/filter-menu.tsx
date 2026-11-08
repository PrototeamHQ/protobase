import { ChevronDown } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from '../lib/cn'
import { menuRightEdge, useMenuTop, viewportGap } from '../primitives/menu-edge'

export type FilterMenuProps = { label: string; activeCount: number; width?: number; defaultOpen?: boolean; children: ReactNode | ((close: () => void) => ReactNode) }

export const FilterMenu = ({ label, activeCount, width = 240, defaultOpen = false, children }: FilterMenuProps) => {
  const [open, setOpen] = useState(defaultOpen)
  const [place, setPlace] = useState<{ right?: number; width: number }>({ width })
  const root = useRef<HTMLDivElement>(null)
  const menu = useRef<HTMLDivElement>(null)

  // A menu that would run past the right edge of the window opens leftwards from the button's right edge instead,
  // placed by `menuRightEdge` so a narrow window keeps its left edge on screen too; a window narrower than the menu
  // narrows it to fit
  useLayoutEffect(() => {
    if (!open || !root.current) return
    const button = root.current.getBoundingClientRect()
    const viewport = document.documentElement.clientWidth
    const fitted = Math.min(width, viewport - 2 * viewportGap)
    setPlace({ width: fitted, right: button.left + fitted > viewport ? button.right - menuRightEdge(button.right, fitted, viewport) : undefined })
  }, [open, width])
  const top = useMenuTop(open, root, menu, place)

  useEffect(() => {
    if (!open) return
    const close = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [open])

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className={cn(
          'inline-flex h-8 items-center gap-1.5 rounded-md border bg-background px-2.5 font-medium shadow-sm transition-colors hover:bg-muted',
          activeCount > 0 ? 'border-primary-border text-primary-text' : 'border-border-strong text-foreground',
        )}
      >
        {label}
        {activeCount > 0 && <span className="rounded-full bg-primary px-1.5 text-[11px] leading-4 text-primary-foreground">{activeCount}</span>}
        <ChevronDown className="size-3.5 text-muted-foreground" />
      </button>
      {open && (
        <div ref={menu} className={cn('absolute top-full z-30 mt-1.5 rounded-lg border bg-background p-3 shadow-pop', place.right === undefined && 'left-0')} style={{ ...place, ...top }}>
          {typeof children === 'function' ? children(() => setOpen(false)) : children}
        </div>
      )}
    </div>
  )
}
