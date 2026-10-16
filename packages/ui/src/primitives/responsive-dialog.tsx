import type { ReactNode } from 'react'
import { useIsDesktop } from '../lib/use-media-query'
import { Dialog } from './dialog'
import { Sheet } from './sheet'

export type ResponsiveDialogProps = {
  title: string
  description?: ReactNode
  open: boolean
  onClose: () => void
  /** Buttons: right-aligned in the modal, stacked full width at the bottom of the sheet. */
  actions: ReactNode
  children?: ReactNode
  /** Room for a row of cards or a table in the modal's body. */
  wide?: boolean
}

/**
 * A modal centred on the screen from the `md` breakpoint up, and a sheet rising from the bottom on a phone, switching as
 * the viewport does. Both close on Escape and on a press outside, and keep focus inside while open.
 */
export const ResponsiveDialog = ({ title, description, open, onClose, actions, children, wide }: ResponsiveDialogProps) => {
  const desktop = useIsDesktop()
  if (!open) return null
  if (desktop) {
    return (
      <Dialog title={title} description={description} onClose={onClose} actions={actions} wide={wide}>
        {children}
      </Dialog>
    )
  }
  return (
    <Sheet title={title} open onClose={onClose}>
      <div className="pt-3">
        {description && <p className="text-muted-foreground">{description}</p>}
        {children && <div className="mt-4">{children}</div>}
        <div className="mt-5 flex flex-col-reverse gap-2 [&>*]:min-h-11">{actions}</div>
      </div>
    </Sheet>
  )
}
