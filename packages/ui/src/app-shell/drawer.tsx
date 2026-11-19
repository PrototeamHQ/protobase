import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { cn } from '../lib/cn'
import { useFocusTrap } from '../lib/use-focus-trap'
import { useDrawerDrag } from '../primitives/use-drawer-drag'
import { text } from './messages'

/** Moves the drawer from a drag that starts elsewhere, such as a swipe from the screen's edge (`useEdgeSwipe`). */
export type DrawerControl = { follow: (progress: number) => void; settle: (progress: number, velocity: number) => void }

export type DrawerProps = {
  id: string
  open: boolean
  onClose: () => void
  children: ReactNode
  /** Opened by a finger from the edge, which it then follows (`control`), rather than sliding in by itself. */
  underFinger?: boolean
  control?: RefObject<DrawerControl | null>
}

/** How long the drawer takes to slide in and out, and its backdrop to fade. */
export const drawerSlideMs = 200

/**
 * The sidebar on small screens: slides over the page, traps focus, closes on Escape, backdrop tap or navigation, and
 * moves under the finger as the native drawer does (`useDrawerDrag`), a drag on it or on the dim closing it. It
 * slides in as it opens and out as it closes, however it is closed, such as a host's `protobase:close-sidebar`; with
 * less motion asked for it shows and goes at once.
 */
export const Drawer = ({ id, open, onClose, children, underFinger, control }: DrawerProps) => {
  const panel = useRef<HTMLDivElement>(null)
  const backdrop = useRef<HTMLDivElement>(null)
  // A field being typed in lets go as the drawer opens, however it opens, so a phone's keyboard closes and the drawer
  // has the whole height
  useLayoutEffect(() => {
    if (!open) return
    const field = document.activeElement
    if (field instanceof HTMLElement && field.matches('input, textarea, select, [contenteditable]')) field.blur()
  }, [open])
  useFocusTrap(panel, open, onClose)
  // Dragged off the screen, it closes without sliding out again; a drag's release is no tap on the dim
  const draggedOut = useRef(false)
  const { panelHandlers, backdropHandlers, dragged, follow, settle } = useDrawerDrag({
    axis: 'x',
    panel,
    backdrop,
    onDraggedClosed: () => {
      draggedOut.current = true
      onClose()
    },
  })
  useLayoutEffect(() => {
    if (!control || !open) return
    control.current = { follow, settle }
    return () => {
      control.current = null
    }
  })
  // Still drawn while it slides out
  const [leaving, setLeaving] = useState(false)
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    setLeaving(!open && !draggedOut.current)
    if (open) draggedOut.current = false
  }
  useEffect(() => {
    if (!leaving) return
    const gone = setTimeout(() => setLeaving(false), drawerSlideMs)
    return () => clearTimeout(gone)
  }, [leaving])
  if (!open && !leaving) return null
  return (
    <div className={cn('fixed inset-0 z-50 md:hidden', leaving && 'pointer-events-none')}>
      <div
        ref={backdrop}
        className={cn('absolute inset-0 touch-none bg-backdrop/40 motion-reduce:[animation:none]', leaving ? '[animation:pb-fade-out_200ms_ease-in_forwards]' : !underFinger && '[animation:pb-fade-in_200ms_ease-out]')}
        style={underFinger && !leaving ? { opacity: 0 } : undefined}
        onClick={() => !dragged() && onClose()}
        {...backdropHandlers}
        aria-hidden
      />
      <div
        ref={panel}
        id={id}
        role="dialog"
        aria-modal="true"
        aria-label={text('navigation')}
        aria-hidden={leaving || undefined}
        tabIndex={-1}
        className={cn(
          // Its colour goes on past its left edge, which a rubber band past open shows
          'absolute inset-y-0 left-0 flex w-[min(88vw,384px)] touch-pan-y bg-sidebar pl-[var(--pb-safe-left)] shadow-pop outline-none motion-reduce:[animation:none] before:absolute before:inset-y-0 before:right-full before:w-10 before:bg-sidebar',
          leaving ? '[animation:pb-drawer-out_200ms_ease-in_forwards]' : !underFinger && '[animation:pb-drawer-in_200ms_ease-out]',
        )}
        style={underFinger && !leaving ? { transform: 'translateX(-100%)' } : undefined}
        onClick={(event) => (event.target as Element).closest('a') && onClose()}
        {...panelHandlers}
      >
        {children}
      </div>
    </div>
  )
}
