import { useRef, type ReactNode } from 'react'
import { useFocusTrap } from '../lib/use-focus-trap'

export type DialogProps = {
  title: string
  description?: ReactNode
  onClose: () => void
  /** Buttons, rendered right-aligned. */
  actions: ReactNode
  children?: ReactNode
}

/** A modal with a title, optional body and action buttons. Closes on Escape and on a click outside. */
export const Dialog = ({ title, description, onClose, actions, children }: DialogProps) => {
  const panel = useRef<HTMLDivElement>(null)
  useFocusTrap(panel, true, onClose)
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-foreground/30 p-4" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} className="outline-none max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg border bg-background p-4 shadow-pop sm:p-5">
        <h2 className="text-[15px] font-semibold">{title}</h2>
        {description && <p className="mt-1.5 text-[13px] text-muted-foreground">{description}</p>}
        {children && <div className="mt-4">{children}</div>}
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end [&>button]:min-h-11 sm:[&>button]:min-h-0">{actions}</div>
      </div>
    </div>
  )
}
