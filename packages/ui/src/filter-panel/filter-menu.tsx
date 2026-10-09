import { ChevronDown } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from '../lib/cn'

export type FilterMenuProps = { label: string; activeCount: number; width?: number; defaultOpen?: boolean; children: ReactNode }

export const FilterMenu = ({ label, activeCount, width = 240, defaultOpen = false, children }: FilterMenuProps) => {
  const [open, setOpen] = useState(defaultOpen)
  const root = useRef<HTMLDivElement>(null)

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
          'inline-flex h-8 items-center gap-1.5 rounded-md border bg-background px-2.5 text-[13px] font-medium shadow-sm transition-colors hover:bg-muted',
          activeCount > 0 ? 'border-primary-border text-primary-text' : 'border-border-strong text-foreground',
        )}
      >
        {label}
        {activeCount > 0 && <span className="rounded-full bg-primary px-1.5 text-[11px] leading-4 text-primary-foreground">{activeCount}</span>}
        <ChevronDown className="size-3.5 text-muted-foreground" />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-30 mt-1.5 rounded-lg border bg-background p-3 shadow-pop" style={{ width }}>
          {children}
        </div>
      )}
    </div>
  )
}
