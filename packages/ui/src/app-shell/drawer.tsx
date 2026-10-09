import { useRef, type ReactNode } from 'react'
import { useFocusTrap } from '../lib/use-focus-trap'

export type DrawerProps = { id: string; open: boolean; onClose: () => void; children: ReactNode }

/** The sidebar on small screens: slides over the page, traps focus, closes on Escape, backdrop tap or navigation. */
export const Drawer = ({ id, open, onClose, children }: DrawerProps) => {
  const panel = useRef<HTMLDivElement>(null)
  useFocusTrap(panel, open, onClose)
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 md:hidden">
      <div className="absolute inset-0 bg-foreground/40" onClick={onClose} aria-hidden />
      <div
        ref={panel}
        id={id}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
        tabIndex={-1}
        className="absolute inset-y-0 left-0 flex w-60 max-w-[85vw] bg-sidebar shadow-pop outline-none"
        onClick={(event) => (event.target as Element).closest('a') && onClose()}
      >
        {children}
      </div>
    </div>
  )
}
