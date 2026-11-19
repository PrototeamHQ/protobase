import { cloneElement, type ReactElement } from 'react'
import { createPortal } from 'react-dom'
import { useIsDesktop } from '../lib/use-media-query'
import { Sheet } from './sheet'

// A menu as the sheet shows it: every row and control at a phone's list size
// A phone list's sizes, all in `em` of the sheet's text, so rows, icons and a segmented switch such as the theme's grow
// with the text size together: 44 pixel rows, 18 pixel icons and a 38 pixel switch at the default size. A menu's
// heading (`data-menu-heading`), such as the account menu's name and email, reads larger, above the rows: its first
// line a step up, its second at the rows' size. The switch is found by its own mark, as a menu's groups of items are
// groups too
const sheetMenu =
  'py-1 text-menu-sheet [&>*]:min-h-[2.9em] [&_[role=menuitem]]:min-h-[2.9em] [&_svg]:size-[1.2em] [&_[data-segmented]]:h-[2.5em] [&_[data-segmented]_button]:min-w-[2.5em] [&_[data-segmented]_button]:justify-center [&_[data-menu-heading]]:py-[0.75em] [&_[data-menu-heading]>:first-child]:text-[1.2em] [&_[data-menu-heading]>:first-child]:font-semibold [&_[data-menu-heading]>:last-child]:text-[0.9em]'

export type MenuSurfaceProps = {
  open: boolean
  /** What a screen reader calls the sheet on a phone, as the menu's label; the sheet shows no title, only the menu. */
  title: string
  onClose: () => void
  /** The menu as it is drawn on a desktop, positioned beside its button: its element keeps its ref, role and handlers. */
  menu: ReactElement<{ className?: string; style?: object }>
  /** On a desktop, drawn where it stands, for a menu positioned against its own wrapper rather than the viewport. */
  inPlaceOnDesktop?: boolean
}

/**
 * Where every menu, popover and select list is presented, so they all look and behave alike: on a phone in the sheet
 * that rises from the bottom, with its drag handle and the menu's own items alone, as on a desktop beside its button. Either way it is drawn at the document's root, with the
 * page's colours, whatever it opens from, such as a brand-coloured bar.
 */
export const MenuSurface = ({ open, title, onClose, menu, inPlaceOnDesktop }: MenuSurfaceProps) => {
  const desktop = useIsDesktop()
  if (!open) return null
  if (desktop) return inPlaceOnDesktop ? menu : createPortal(menu, document.body)
  return (
    <Sheet title={title} open onClose={onClose} inset="none" header="handle">
      {/* A phone's list size for every row and control in it, items and others alike (such as a theme switch): text, which
          they inherit, row height, icons and a group's buttons; secondary lines keep their own size */}
      {cloneElement(menu, { className: sheetMenu, style: undefined })}
    </Sheet>
  )
}
