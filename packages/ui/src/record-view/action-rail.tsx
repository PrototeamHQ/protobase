import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '../lib/cn'

export type RailAction = {
  name: string
  description?: string
  icon: LucideIcon
  onRun?: () => void
  /** Why the action cannot run now; the button is disabled with this as its tooltip. */
  blocked?: string
  running?: boolean
  /** `danger` draws an action that destroys something, such as Delete, in red. */
  tone?: 'danger'
  /** Draws the action as the caller's own element, such as a link, given the rail's classes and content, instead of a button. */
  render?: (item: { className: string; children: ReactNode }) => ReactNode
}

const itemClass =
  'flex min-h-11 items-center gap-2 rounded-md border border-border-strong px-3 text-left hover:bg-surface disabled:cursor-default disabled:opacity-60 md:min-h-0 md:w-full md:items-start md:gap-3 md:rounded-none md:border-0 md:px-4 md:py-3'

/** Named actions with one-line descriptions; on phones a row of buttons, from `md` a list. */
export const ActionRail = ({ actions }: { actions: RailAction[] }) => (
  <div className="overflow-hidden rounded-lg border border-border bg-background">
    <h3 className="hidden border-b border-border px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground md:block">Actions</h3>
    <ul className="flex flex-wrap gap-2 p-2 md:block md:divide-y md:divide-border md:p-0">
      {actions.map(({ name, description, icon: Icon, onRun, blocked, running, tone, render }) => {
        const children = (
          <>
            <Icon className={cn('size-4 shrink-0 md:mt-0.5', tone === 'danger' ? 'text-danger-text' : 'text-muted-foreground')} aria-hidden />
            <span>
              <span className={cn('block font-medium', tone === 'danger' ? 'text-danger-text' : 'text-foreground')}>{name}</span>
              {description && <span className="mt-0.5 hidden text-xs leading-snug text-muted-foreground md:block">{description}</span>}
            </span>
          </>
        )
        return (
          <li key={name}>
            {render ? (
              render({ className: itemClass, children })
            ) : (
              <button type="button" onClick={onRun} disabled={Boolean(blocked) || running} title={blocked} className={itemClass}>
                {children}
              </button>
            )}
          </li>
        )
      })}
    </ul>
  </div>
)
