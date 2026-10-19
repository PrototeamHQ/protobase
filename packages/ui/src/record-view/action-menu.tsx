import { MoreVertical } from 'lucide-react'
import { createPortal } from 'react-dom'
import { cn } from '../lib/cn'
import { menuItemClass } from '../primitives/menu-item'
import { usePopoverMenu } from '../primitives/popover-menu'
import type { RailAction } from './action-rail'
import { text } from './messages'

/**
 * The actions of an action rail as a menu behind a "..." button, as a mobile screen's top bar holds them: each item the
 * rail's, a link where the rail draws one, disabled with its reason when it cannot run. `className` styles the button.
 */
export const ActionMenu = ({ actions, label = text('actions'), className }: { actions: RailAction[]; label?: string; className?: string }) => {
  const { open, setOpen, place, button, menu } = usePopoverMenu()
  if (actions.length === 0) return null
  return (
    <>
      <button ref={button} type="button" aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)} className={className}>
        <MoreVertical className="size-5" />
      </button>
      {open &&
        createPortal(
          <ul ref={menu} role="menu" aria-label={label} style={place ?? { visibility: 'hidden' }} className="fixed z-50 min-w-48 rounded-md border bg-background py-1 shadow-pop">
            {actions.map(({ name, icon: Icon, onRun, blocked, running, tone, render }) => {
              const children = (
                <>
                  <Icon className={cn('size-4 shrink-0', tone === 'danger' ? 'text-danger-text' : 'text-muted-foreground')} aria-hidden />
                  <span className={cn('font-medium', tone === 'danger' && 'text-danger-text')}>{name}</span>
                </>
              )
              return (
                <li key={name} role="none" onClick={() => setOpen(false)}>
                  {render ? (
                    render({ className: menuItemClass, children, role: 'menuitem' })
                  ) : (
                    <button type="button" role="menuitem" onClick={onRun} disabled={Boolean(blocked) || running} title={blocked} className={menuItemClass}>
                      {children}
                    </button>
                  )}
                </li>
              )
            })}
          </ul>,
          document.body,
        )}
    </>
  )
}
