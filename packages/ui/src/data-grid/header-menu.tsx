import { MoreHorizontal } from 'lucide-react'
import { createPortal } from 'react-dom'
import { usePopoverMenu } from '../primitives/popover-menu'
import { text } from './messages'

export type HeaderMenuProps = { header: string; pinned: boolean; sortable: boolean; onTogglePin: () => void }

/** Why a column header does nothing when pressed: a list sorts only on the columns its view makes sortable. */
export const unsortableText = () => text('unsortable')

/**
 * The "..." in a column header: pinning the column to the left edge, and saying so when the list can't sort by it. The
 * menu is portalled to the body, as the row menu is: the header row clips, so a menu inside it would be cut off at the
 * header's bottom edge, with the rows showing where it should be.
 */
export const HeaderMenu = ({ header, pinned, sortable, onTogglePin }: HeaderMenuProps) => {
  const { open, setOpen, place, button, menu } = usePopoverMenu()

  return (
    <div className="relative ml-auto shrink-0">
      <button
        ref={button}
        type="button"
        aria-label={text('columnMenu', { header })}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="relative inline-flex size-5 items-center justify-center rounded text-faint-foreground hover:bg-muted hover:text-foreground focus-visible:opacity-100 after:absolute after:-inset-2 after:content-[''] md:opacity-0 md:group-hover/cell:opacity-100 aria-expanded:opacity-100"
      >
        <MoreHorizontal className="size-3.5" />
      </button>
      {open &&
        createPortal(
          <ul ref={menu} role="menu" style={place ?? { visibility: 'hidden' }} className="fixed z-50 min-w-32 rounded-md border bg-background py-1 text-body font-normal text-foreground shadow-pop">
            {!sortable && (
              <li role="none">
                <span role="menuitem" aria-disabled="true" className="block min-h-9 whitespace-nowrap px-3 py-1.5 text-muted-foreground">
                  {unsortableText()}
                </span>
              </li>
            )}
            <li role="none">
              <button
                type="button"
                role="menuitem"
                className="block min-h-9 w-full whitespace-nowrap px-3 py-1.5 text-left hover:bg-muted"
                onClick={() => {
                  setOpen(false)
                  onTogglePin()
                }}
              >
                {pinned ? text('unpin') : text('pinToLeft')}
              </button>
            </li>
          </ul>,
          document.body,
        )}
    </div>
  )
}
