import { useEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from '../lib/cn'
import { useFocusTrap } from '../lib/use-focus-trap'
import { text } from './messages'

export type DrawerProps = { id: string; open: boolean; onClose: () => void; children: ReactNode }

/** How long the drawer takes to slide in and out, and its backdrop to fade. */
export const drawerSlideMs = 200

/**
 * The sidebar on small screens: slides over the page, traps focus, closes on Escape, backdrop tap or navigation. It
 * slides in as it opens and out as it closes, however it is closed, such as a host's `protobase:close-sidebar`; with
 * less motion asked for it shows and goes at once.
 */
export const Drawer = ({ id, open, onClose, children }: DrawerProps) => {
  const panel = useRef<HTMLDivElement>(null)
  useFocusTrap(panel, open, onClose)
  // Still drawn while it slides out
  const [leaving, setLeaving] = useState(false)
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    setLeaving(!open)
  }
  useEffect(() => {
    if (!leaving) return
    const gone = setTimeout(() => setLeaving(false), drawerSlideMs)
    return () => clearTimeout(gone)
  }, [leaving])
  if (!open && !leaving) return null
  return (
    <div className={cn('fixed inset-0 z-50 md:hidden', leaving && 'pointer-events-none')}>
      <div className={cn('absolute inset-0 bg-backdrop/40 motion-reduce:[animation:none]', leaving ? '[animation:pb-fade-out_200ms_ease-in_forwards]' : '[animation:pb-fade-in_200ms_ease-out]')} onClick={onClose} aria-hidden />
      <div
        ref={panel}
        id={id}
        role="dialog"
        aria-modal="true"
        aria-label={text('navigation')}
        aria-hidden={leaving || undefined}
        tabIndex={-1}
        className={cn(
          'absolute inset-y-0 left-0 flex w-[calc(15rem+var(--pb-safe-left))] max-w-[85vw] bg-sidebar pl-[var(--pb-safe-left)] shadow-pop outline-none motion-reduce:[animation:none]',
          leaving ? '[animation:pb-drawer-out_200ms_ease-in_forwards]' : '[animation:pb-drawer-in_200ms_ease-out]',
        )}
        onClick={(event) => (event.target as Element).closest('a') && onClose()}
      >
        {children}
      </div>
    </div>
  )
}
