import type { LucideIcon } from 'lucide-react'

export type RailAction = {
  name: string
  description?: string
  icon: LucideIcon
  onRun?: () => void
  /** Why the action cannot run now; the button is disabled with this as its tooltip. */
  blocked?: string
  running?: boolean
}

/** Named actions with one-line descriptions; on phones a row of buttons, from `md` a list. */
export const ActionRail = ({ actions }: { actions: RailAction[] }) => (
  <div className="overflow-hidden rounded-lg border border-border bg-background">
    <h3 className="hidden border-b border-border px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground md:block">Actions</h3>
    <ul className="flex flex-wrap gap-2 p-2 md:block md:divide-y md:divide-border md:p-0">
      {actions.map(({ name, description, icon: Icon, onRun, blocked, running }) => (
        <li key={name}>
          <button
            type="button"
            onClick={onRun}
            disabled={Boolean(blocked) || running}
            title={blocked}
            className="flex min-h-11 items-center gap-2 rounded-md border border-border-strong px-3 text-left hover:bg-surface disabled:cursor-default disabled:opacity-60 md:min-h-0 md:w-full md:items-start md:gap-3 md:rounded-none md:border-0 md:px-4 md:py-3"
          >
            <Icon className="size-4 shrink-0 text-muted-foreground md:mt-0.5" />
            <span>
              <span className="block text-[13px] font-medium text-foreground">{name}</span>
              {description && <span className="mt-0.5 hidden text-xs leading-snug text-muted-foreground md:block">{description}</span>}
            </span>
          </button>
        </li>
      ))}
    </ul>
  </div>
)
