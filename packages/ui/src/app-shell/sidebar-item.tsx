import { cn } from '../lib/cn'
import { Tooltip } from '../primitives/tooltip'
import type { NavItem } from './nav'
import { isTextMode, showsLabelInline, type SidebarMode } from './sidebar-mode'

export type SidebarItemProps = { item: NavItem; mode: SidebarMode; active: boolean; onNavigate?: (href: string) => void; className?: string }

const layout = {
  'text-large': 'h-9 gap-3 px-3 text-sm',
  'text-small': 'h-7 gap-2.5 px-2.5 text-xs',
  icon: 'size-9 justify-center',
  'icon-label': 'w-full flex-col gap-0.5 py-1.5 text-[10px]',
  'icon-tooltip': 'size-9 justify-center',
  'icon-expand': 'h-8 gap-3 px-3 text-[13px]',
} satisfies Record<SidebarMode, string>

export const SidebarItem = ({ item, mode, active, onNavigate, className }: SidebarItemProps) => {
  const Icon = item.icon
  const button = (
    <a
      onClick={onNavigate && ((event) => { event.preventDefault(); onNavigate(item.href ?? `#${item.id}`) })}
      href={item.href ?? `#${item.id}`}
      aria-label={item.label}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex shrink-0 items-center rounded-md font-medium transition-colors',
        layout[mode],
        active ? 'bg-primary-soft text-primary-text' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
        className,
      )}
    >
      <Icon className={cn('shrink-0', mode === 'text-small' ? 'size-4' : 'size-[18px]')} strokeWidth={active ? 2.2 : 1.9} />
      {(showsLabelInline(mode) || mode === 'icon-label') && <span className="whitespace-nowrap">{item.label}</span>}
      {isTextMode(mode) && item.count && (
        <span className="ml-auto rounded bg-muted px-1.5 text-[11px] tabular-nums text-muted-foreground">{item.count}</span>
      )}
    </a>
  )
  return mode === 'icon-tooltip' ? <Tooltip label={item.label}>{button}</Tooltip> : button
}
