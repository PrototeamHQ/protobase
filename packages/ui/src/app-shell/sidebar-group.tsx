import { ChevronRight } from 'lucide-react'
import { useId, useState, type MouseEvent } from 'react'
import { cn } from '../lib/cn'
import type { NavItem, NavRecent } from './nav'
import { navOpenStorageKey, readNavOpen, writeNavOpen } from './nav-open-storage'
import { SidebarItem } from './sidebar-item'
import { StatusDot } from './status-dot'

export type SidebarGroupProps = {
  item: NavItem
  recent: NavRecent
  mode: 'text-large' | 'text-small'
  active: boolean
  onNavigate?: (href: string) => void
}

const row = {
  'text-large': 'h-8 gap-2.5 px-2.5 text-[13px]',
  'text-small': 'h-7 gap-2 px-2 text-xs',
}

/** Lines the records up under the entry's icon. */
const indent = { 'text-large': 'ml-[20px]', 'text-small': 'ml-[17px]' }

/**
 * A sidebar entry with a few of its records under it. The label opens the list, the chevron shows or hides the
 * records (remembered in this browser), and "View all" at the end opens the list too.
 */
export const SidebarGroup = ({ item, recent, mode, active, onNavigate }: SidebarGroupProps) => {
  const storageKey = navOpenStorageKey(item.id)
  const [open, setOpen] = useState(() => readNavOpen(localStorage, storageKey))
  const listId = useId()
  const href = item.href ?? `#${item.id}`
  const toggle = () => {
    writeNavOpen(localStorage, storageKey, !open)
    setOpen(!open)
  }
  const link = (to: string) => ({ href: to, onClick: onNavigate && ((event: MouseEvent) => { event.preventDefault(); onNavigate(to) }) })

  return (
    <div className="flex flex-col gap-0.5">
      <div className="relative">
        <SidebarItem item={item} mode={mode} active={active} onNavigate={onNavigate} className="pr-8" />
        <button
          type="button"
          aria-expanded={open}
          aria-controls={listId}
          aria-label={`Recent ${item.label.toLowerCase()}`}
          onClick={toggle}
          className="absolute right-1 top-1/2 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded text-faint-foreground hover:bg-muted hover:text-foreground"
        >
          <ChevronRight className={cn('size-3.5 transition-transform', open && 'rotate-90')} />
        </button>
      </div>
      {open && (
        <ul id={listId} aria-label={`Recent ${item.label.toLowerCase()}`} className={cn('flex flex-col gap-0.5 border-l pl-1.5', indent[mode])}>
          {recent.state === 'loading' && (
            <li className={cn('flex items-center text-faint-foreground', row[mode])}>Loading...</li>
          )}
          {recent.state === 'error' && (
            <li className={cn('flex items-center text-faint-foreground', row[mode])}>Could not load</li>
          )}
          {recent.state === 'ready' &&
            recent.records.map((record) => (
              <li key={record.id}>
                <a
                  {...link(record.href)}
                  aria-label={`${record.label}, ${record.status}`}
                  title={`${record.label} (${record.status})`}
                  aria-current={record.active ? 'page' : undefined}
                  className={cn('flex min-w-0 items-center rounded-md font-medium transition-colors', row[mode], record.active ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}
                >
                  <StatusDot tone={record.tone} pulse={record.pulse} />
                  <span className="truncate">{record.label}</span>
                </a>
              </li>
            ))}
          <li>
            <a {...link(href)} className={cn('flex items-center rounded-md text-faint-foreground transition-colors hover:bg-muted hover:text-foreground', row[mode])}>
              View all
            </a>
          </li>
        </ul>
      )}
    </div>
  )
}
