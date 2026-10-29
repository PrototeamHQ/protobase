import { MoreHorizontal } from 'lucide-react'
import { createPortal } from 'react-dom'
import { cn } from '../lib/cn'
import { usePopoverMenu } from '../primitives/popover-menu'
import { RouteLink, type RouteTarget } from '../primitives/route-link'
import type { GridRow } from './column-spec'
import { text } from './messages'

/**
 * `label` may name the row's own text. `available` hides the action for rows it does not apply to, for example a delete
 * the server will refuse; `blocked` shows it disabled, with why as its tooltip.
 */
type RowActionBase = { label: string | ((row: GridRow) => string); destructive?: boolean; available?: (row: GridRow) => boolean; blocked?: (row: GridRow) => string | undefined }
/** `link` makes the item an ordinary link to where it goes, as every navigation is, unless it is `blocked`; `onSelect` runs anything else. */
export type RowAction = RowActionBase & ({ onSelect: (row: GridRow) => void; link?: never } | { link: (row: GridRow) => RouteTarget; onSelect?: never })

const labelOf = (action: RowAction, row: GridRow) => (typeof action.label === 'string' ? action.label : action.label(row))

/** The actions that apply to a row; a row with none gets no menu at all. */
export const availableActions = (actions: RowAction[], row: GridRow) => actions.filter((action) => action.available?.(row) ?? true)

/**
 * The "..." button at the end of a row, with a small menu of the row's actions. The menu is portalled to the body:
 * every grid row is its own stacking context and the grid body clips, so a menu inside the row would sit under the
 * rows below it.
 */
export const RowMenu = ({ row, actions }: { row: GridRow; actions: RowAction[] }) => {
  const { open, setOpen, place, button, menu } = usePopoverMenu()

  return (
    <div className="relative flex justify-center bg-inherit" onClick={(event) => event.stopPropagation()}>
      <button ref={button} type="button" aria-label={text('rowActions')} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)} className="inline-flex items-center justify-center rounded p-1 text-faint-foreground hover:bg-muted hover:text-foreground pointer-coarse:size-11">
        <MoreHorizontal className="size-4" />
      </button>
      {open &&
        createPortal(
          <ul ref={menu} role="menu" onClick={(event) => event.stopPropagation()} style={place ?? { visibility: 'hidden' }} className="fixed z-50 min-w-36 rounded-md border bg-background py-1 shadow-pop">
            {actions.map((action, index) => {
              const label = labelOf(action, row)
              const blocked = action.blocked?.(row)
              const itemClass = cn('block w-full px-3 py-1.5 text-left hover:bg-muted disabled:cursor-default disabled:opacity-60 disabled:hover:bg-transparent', action.destructive && 'text-danger-text')
              return (
                <li key={index} role="none">
                  {action.link && blocked === undefined ? (
                    <RouteLink role="menuitem" to={action.link(row)} onClick={() => setOpen(false)} className={itemClass}>
                      {label}
                    </RouteLink>
                  ) : (
                    <button
                      type="button"
                      role="menuitem"
                      disabled={blocked !== undefined}
                      title={blocked}
                      className={itemClass}
                      onClick={() => {
                        setOpen(false)
                        action.onSelect?.(row)
                      }}
                    >
                      {label}
                    </button>
                  )}
                </li>
              )
            })}
          </ul>,
          document.body,
        )}
    </div>
  )
}
