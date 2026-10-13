import { X } from 'lucide-react'
import { useRef, type ReactNode } from 'react'
import { useFocusTrap } from '../lib/use-focus-trap'

export type SheetProps = { title: string; open: boolean; onClose: () => void; children: ReactNode }

/** A panel that rises from the bottom of the screen, for the filter panel on phones. */
export const Sheet = ({ title, open, onClose, children }: SheetProps) => {
  const panel = useRef<HTMLDivElement>(null)
  useFocusTrap(panel, open, onClose)
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[80]">
      <div className="absolute inset-0 bg-foreground/40" onClick={onClose} aria-hidden />
      <div ref={panel} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} className="absolute inset-x-0 bottom-0 flex max-h-[85vh] flex-col rounded-t-xl border-t bg-background shadow-pop outline-none">
        <header className="flex shrink-0 items-center justify-between border-b px-4">
          <h2 className="text-[15px] font-semibold">{title}</h2>
          <button type="button" aria-label="Close" onClick={onClose} className="-mr-2 inline-flex size-11 items-center justify-center rounded-md text-muted-foreground hover:bg-muted">
            <X className="size-5" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-6">{children}</div>
      </div>
    </div>
  )
}
