import { useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '../lib/cn'
import { useFocusTrap } from '../lib/use-focus-trap'

export type DialogProps = {
  title: string
  description?: ReactNode
  onClose: () => void
  /** Buttons, rendered right-aligned. */
  actions: ReactNode
  children?: ReactNode
  /** Room for a row of cards or a table in the body, instead of a short question. */
  wide?: boolean
  /** Names the dialog in its layer's `data-dialog`, for code that asks whether an element sits in it. */
  name?: string
}

/**
 * A modal with a title, optional body and action buttons. Closes on Escape and on a click outside. It is portalled to
 * the body, so no stacking context of the page it opens from, such as a sticky column, puts page content above it.
 */
export const Dialog = ({ title, description, onClose, actions, children, wide = false, name }: DialogProps) => {
  const panel = useRef<HTMLDivElement>(null)
  useFocusTrap(panel, true, onClose)
  return createPortal(
    <div data-dialog={name} className="fixed inset-0 z-[90] flex items-center justify-center bg-backdrop/30 p-4 pb-[calc(1rem+var(--pb-safe-bottom))] pl-[calc(1rem+var(--pb-safe-left))] pr-[calc(1rem+var(--pb-safe-right))] pt-[calc(1rem+var(--pb-safe-top))]" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} className={cn('outline-none max-h-[min(90vh,100%)] w-full overflow-y-auto rounded-lg border bg-background p-4 shadow-pop sm:p-5', wide ? 'max-w-3xl' : 'max-w-md')}>
        <h2 className="text-[16px] font-semibold">{title}</h2>
        {description && <p className="mt-1.5 text-muted-foreground">{description}</p>}
        {children && <div className="mt-4">{children}</div>}
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end [&>*]:min-h-11 sm:[&>*]:min-h-0">{actions}</div>
      </div>
    </div>,
    document.body,
  )
}
