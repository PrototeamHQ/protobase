import { Plus } from 'lucide-react'
import { cn } from '../lib/cn'
import type { NavItem } from './nav'
import { subRow, subRowIndent } from './sidebar-rows'

export type SidebarCreateLinkProps = {
  create: NonNullable<NavItem['create']>
  mode: 'text-large' | 'text-small'
  onNavigate?: (href: string) => void
}

/** The link under a sidebar entry to its resource's create form, such as "New message", lined up with its records. */
export const SidebarCreateLink = ({ create, mode, onNavigate }: SidebarCreateLinkProps) => (
  <div className={cn('border-l border-transparent pl-1.5', subRowIndent[mode])}>
    <a
      href={create.href}
      onClick={onNavigate && ((event) => { event.preventDefault(); onNavigate(create.href) })}
      className={cn('flex items-center rounded-md text-faint-foreground transition-colors hover:bg-muted hover:text-foreground', subRow[mode])}
    >
      <Plus aria-hidden className="size-3.5 shrink-0" />
      <span className="truncate">{create.label}</span>
    </a>
  </div>
)
