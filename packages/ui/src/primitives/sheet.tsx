import { X } from 'lucide-react'
import { useRef, type ReactNode } from 'react'
import { useFocusTrap } from '../lib/use-focus-trap'
import { useSheetDrag } from './use-sheet-drag'
import { text } from './messages'

export type SheetProps = { title: string; open: boolean; onClose: () => void; children: ReactNode }

/**
 * A panel that rises from the bottom of the screen, for the filter panel and `ResponsiveDialog` on mobile screens. It
 * moves under the finger as a native sheet does (`useSheetDrag`): dragged down by its header or handle, or by its
 * content once that is scrolled to its top, it closes or springs back by how far and how fast it went. It also closes
 * on Escape, the close button, the handle and a press above it. Its content scrolls inside it when taller than the
 * panel, which stops short of the top so the screen behind stays in sight.
 */
export const Sheet = ({ title, open, onClose, children }: SheetProps) => {
  const panel = useRef<HTMLDivElement>(null)
  const backdrop = useRef<HTMLDivElement>(null)
  const content = useRef<HTMLDivElement>(null)
  const { dismiss, header } = useSheetDrag({ panel, backdrop, content, open, onClose })
  useFocusTrap(panel, open, dismiss)
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[80]">
      <div ref={backdrop} className="absolute inset-0 bg-backdrop/40" onClick={dismiss} aria-hidden />
      <div ref={panel} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} className="absolute inset-x-0 bottom-0 flex max-h-[85vh] flex-col rounded-t-xl border-t bg-background pl-[var(--pb-safe-left)] pr-[var(--pb-safe-right)] shadow-pop outline-none will-change-transform">
        <header className="relative flex shrink-0 touch-none select-none items-center justify-between border-b px-4" {...header}>
          <h2 className="text-[16px] font-semibold">{title}</h2>
          <button type="button" aria-label={text('close')} onClick={dismiss} className="-mr-2 inline-flex size-11 items-center justify-center rounded-md text-muted-foreground hover:bg-muted">
            <X className="size-5" />
          </button>
          <button type="button" aria-label={text('dragToClose')} onClick={dismiss} className="absolute left-1/2 top-0 flex h-4 w-16 -translate-x-1/2 items-start justify-center pt-1.5">
            <span className="h-1 w-9 rounded-full bg-border-strong" />
          </button>
        </header>
        <div ref={content} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[calc(1.5rem+var(--pb-safe-bottom))]">{children}</div>
      </div>
    </div>
  )
}
