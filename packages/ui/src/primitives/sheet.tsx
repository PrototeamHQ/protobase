import { X } from 'lucide-react'
import { useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '../lib/cn'
import { useFocusTrap } from '../lib/use-focus-trap'
import { useSheetDrag } from './use-sheet-drag'
import { text } from './messages'

export type SheetProps = {
  title: string
  open: boolean
  onClose: () => void
  children: ReactNode
  /** The content's side padding: the sheet's own, or `none` for content that has its own, such as a menu's items. */
  inset?: 'sides' | 'none'
  /**
   * Its top: the title and a close button, or the drag handle alone, `handle`, for a menu, which shows only its own items
   * as it does beside its button on a desktop; `title` then names the sheet for a screen reader only.
   */
  header?: 'title' | 'handle'
}

/**
 * A panel that rises from the bottom of the screen, for the filter panel and `ResponsiveDialog` on mobile screens. It
 * moves under the finger as a native sheet does (`useSheetDrag`): dragged down by its header or handle, or by its
 * content once that is scrolled to its top, it closes or springs back by how far and how fast it went. It also closes
 * on Escape, the close button, the handle and a press above it. Its content scrolls inside it when taller than the
 * panel, which stops short of the top so the screen behind stays in sight. It is drawn at the document's root, so it has
 * the page's colours wherever it opens from, such as a brand-coloured bar, and its content ends above the bottom bar.
 */
export const Sheet = ({ title, open, onClose, children, inset = 'sides', header: top = 'title' }: SheetProps) => {
  const panel = useRef<HTMLDivElement>(null)
  const backdrop = useRef<HTMLDivElement>(null)
  const content = useRef<HTMLDivElement>(null)
  const { dismiss, header } = useSheetDrag({ panel, backdrop, content, open, onClose })
  useFocusTrap(panel, open, dismiss)
  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-[80]">
      <div ref={backdrop} className="absolute inset-0 bg-backdrop/40" onClick={dismiss} aria-hidden />
      <div ref={panel} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} className="absolute inset-x-0 bottom-0 flex max-h-[85vh] flex-col rounded-t-xl border-t bg-background pl-[var(--pb-safe-left)] pr-[var(--pb-safe-right)] shadow-pop outline-none will-change-transform">
        {/* Below the drag handle, which sits in the header's top */}
        <header className={cn('relative flex shrink-0 touch-none select-none items-center justify-between', top === 'title' ? 'border-b px-4 pt-4' : 'h-5')} {...header}>
          {top === 'title' && (
            <>
              <h2 className="text-base font-semibold">{title}</h2>
              <button type="button" aria-label={text('close')} onClick={dismiss} className="-mr-2 inline-flex size-11 items-center justify-center rounded-md text-muted-foreground hover:bg-muted">
                <X className="size-5" />
              </button>
            </>
          )}
          <button type="button" aria-label={text('dragToClose')} onClick={dismiss} className="absolute left-1/2 top-0 flex h-4 w-16 -translate-x-1/2 items-start justify-center pt-1.5">
            <span className="h-1 w-9 rounded-full bg-border-strong" />
          </button>
        </header>
        <div ref={content} className={cn('min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[calc(1.5rem+max(var(--pb-safe-bottom),var(--pb-sticky-bottom,0px)))]', inset === 'sides' && 'px-4')}>{children}</div>
      </div>
    </div>,
    document.body,
  )
}
