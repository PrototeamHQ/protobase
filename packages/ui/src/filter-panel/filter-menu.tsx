import { ChevronDown } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from '../lib/cn'

export type FilterMenuProps = { label: string; activeCount: number; width?: number; defaultOpen?: boolean; children: ReactNode }

export const FilterMenu = ({ label, activeCount, width = 240, defaultOpen = false, children }: FilterMenuProps) => {
  const [open, setOpen] = useState(defaultOpen)
  const [alignEnd, setAlignEnd] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  // A menu that would run past the right edge of the window opens leftwards from the button's right edge instead
  useLayoutEffect(() => {
    if (!open || !root.current) return
    setAlignEnd(root.current.getBoundingClientRect().left + width > document.documentElement.clientWidth)
  }, [open, width])

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
        <div className={cn('absolute top-full z-30 mt-1.5 rounded-lg border bg-background p-3 shadow-pop', alignEnd ? 'right-0' : 'left-0')} style={{ width }}>
          {children}
        </div>
      )}
    </div>
  )
}
