import { cloneElement, type ReactElement } from 'react'
import { createPortal } from 'react-dom'
import { useIsDesktop } from '../lib/use-media-query'
import { Sheet } from './sheet'

// A menu as the sheet shows it: every row and control at a phone's list size
const sheetMenu = 'py-1 text-menu-sheet [&>*]:min-h-12 [&_[role=menuitem]]:min-h-12 [&_svg]:size-5 [&_[role=group]_button]:min-h-10 [&_[role=group]_button]:min-w-10 [&_[role=group]_button]:justify-center'

export type MenuSurfaceProps = {
  open: boolean
  /** What the sheet is titled on a phone, as the menu's label. */
  title: string
  onClose: () => void
  /** The menu as it is drawn on a desktop, positioned beside its button: its element keeps its ref, role and handlers. */
  menu: ReactElement<{ className?: string; style?: object }>
  /** On a desktop, drawn where it stands, for a menu positioned against its own wrapper rather than the viewport. */
  inPlaceOnDesktop?: boolean
}

/**
 * Where every menu, popover and select list is presented, so they all look and behave alike: on a phone in the sheet
 * that rises from the bottom, on a desktop beside its button. Either way it is drawn at the document's root, with the
 * page's colours, whatever it opens from, such as a brand-coloured bar.
 */
export const MenuSurface = ({ open, title, onClose, menu, inPlaceOnDesktop }: MenuSurfaceProps) => {
  const desktop = useIsDesktop()
  if (!open) return null
  if (desktop) return inPlaceOnDesktop ? menu : createPortal(menu, document.body)
  return (
    <Sheet title={title} open onClose={onClose} inset="none">
      {/* A phone's list size for every row and control in it, items and others alike (such as a theme switch): text, which
          they inherit, row height, icons and a group's buttons; secondary lines keep their own size */}
      {cloneElement(menu, { className: sheetMenu, style: undefined })}
    </Sheet>
  )
}
