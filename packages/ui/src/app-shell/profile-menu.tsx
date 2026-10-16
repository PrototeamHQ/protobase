import { ChevronsUpDown, LogOut, type LucideIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { cn } from '../lib/cn'
import { Avatar } from '../primitives/avatar'
import { Badge, type BadgeTone } from '../primitives/badge'
import { SwitchGroup } from './switch-group'
import { ThemeSwitch, type ProfileTheme } from './theme-switch'

export type ShellUser = { name: string; email: string; initials: string; hue: number; role: string; roleTone: BadgeTone }

/** One of the app's own pages in the menu: inside the admin it navigates, `external` opens a new tab. */
export type ProfileMenuItem = { id: string; label: string; icon: LucideIcon; href: string; external?: boolean; active?: boolean }

/** The organizations to switch between: the one worked in, and the person's others. */
export type ProfileOrganizations = { current?: { id: string; name: string }; others: { id: string; name: string }[]; onSwitch: (id: string) => void }

/** The roles to switch between: the one the person acts with, and every role they hold, each with its label. */
export type ProfileRoles = { active: string; roles: { name: string; label: string }[]; onSwitch: (name: string) => void }

export type ProfileMenuProps = {
  user: ShellUser
  compact: boolean
  /** Controls the menu from outside, for stories; without it the menu opens and closes itself. */
  open?: boolean
  /** The app's pages, listed above "Sign out". */
  items?: ProfileMenuItem[]
  /** Follows an item that is not `external`; without it the link loads the page. */
  onNavigate?: (href: string) => void
  /** Adds "Sign out" to the menu. */
  onSignOut?: () => void
  /** Lists the organizations below the person, to switch between them. */
  organizations?: ProfileOrganizations
  /** Lists the roles below the organizations, to switch between them; left out for someone with one role. */
  roles?: ProfileRoles
  /** Adds the theme switch above "Sign out". */
  theme?: ProfileTheme
}

const menuRow = 'flex min-h-11 w-full items-center gap-2.5 px-3 py-1.5 text-left text-muted-foreground hover:bg-muted md:min-h-0'

/** The person at the bottom of the sidebar; the menu is fixed to the viewport so a narrow sidebar cannot clip it. */
export const ProfileMenu = ({ user, compact, open: controlled, items = [], onNavigate, onSignOut, organizations, roles, theme }: ProfileMenuProps) => {
  const activeRole = roles?.roles.find((role) => role.name === roles.active)
  const [local, setLocal] = useState(false)
  const open = controlled ?? local
  const root = useRef<HTMLDivElement>(null)
  const [anchor, setAnchor] = useState<{ left: number; bottom: number }>()

  useEffect(() => {
    if (!open || controlled !== undefined) return
    const close = (event: Event) => {
      if (event instanceof KeyboardEvent ? event.key === 'Escape' : !root.current?.contains(event.target as Node)) setLocal(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', close)
    }
  }, [open, controlled])

  const toggle = () => {
    const rect = root.current?.getBoundingClientRect()
    if (rect) setAnchor({ left: rect.left, bottom: window.innerHeight - rect.top + 8 })
    setLocal(!local)
  }

  return (
    <div ref={root} className="relative">
      <button type="button" className="flex min-h-11 w-full items-center gap-2.5 rounded-md p-1 text-left hover:bg-muted md:min-h-0" aria-label="Profile menu" aria-haspopup="menu" aria-expanded={open} onClick={toggle}>
        <Avatar initials={user.initials} hue={user.hue} size="md" className="ring-0" />
        {!compact && (
          <>
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block truncate font-medium">{user.name}</span>
              <Badge tone={user.roleTone} dot={false} className="mt-0.5 h-4 px-1.5 text-[10px]">
                {user.role}
              </Badge>
            </span>
            <ChevronsUpDown className="size-3.5 shrink-0 text-faint-foreground" />
          </>
        )}
      </button>
      {open && (
        <div role="menu" className={controlled === undefined ? 'fixed z-[60] w-56 overflow-hidden rounded-lg border bg-background py-1 shadow-pop' : 'absolute bottom-full left-0 z-50 mb-2 w-56 overflow-hidden rounded-lg border bg-background py-1 shadow-pop'} style={controlled === undefined && anchor ? { left: anchor.left, bottom: anchor.bottom } : undefined}>
          <div className="border-b px-3 pb-2 pt-1.5">
            <div className="font-medium">{user.name}</div>
            <div className="truncate text-xs text-muted-foreground">{user.email}</div>
          </div>
          {organizations && (organizations.current || organizations.others.length > 0) && (
            <SwitchGroup
              label="Organizations"
              {...(organizations.current && { current: { id: organizations.current.id, label: organizations.current.name } })}
              others={organizations.others.map(({ id, name }) => ({ id, label: name }))}
              rowClassName={menuRow}
              onSwitch={(id) => {
                setLocal(false)
                organizations.onSwitch(id)
              }}
            />
          )}
          {roles && roles.roles.length > 1 && (
            <SwitchGroup
              label="Roles"
              {...(activeRole && { current: { id: activeRole.name, label: activeRole.label } })}
              others={roles.roles.filter((role) => role !== activeRole).map(({ name, label }) => ({ id: name, label }))}
              rowClassName={menuRow}
              onSwitch={(name) => {
                setLocal(false)
                roles.onSwitch(name)
              }}
            />
          )}
          {items.length > 0 && (
            <div className={cn((theme || onSignOut) && 'border-b')}>
              {items.map((item) => {
                const Icon = item.icon
                return (
                  <a
                    key={item.id}
                    role="menuitem"
                    href={item.href}
                    aria-current={item.active ? 'page' : undefined}
                    {...(item.external ? { target: '_blank', rel: 'noreferrer' } : {})}
                    onClick={(event) => {
                      setLocal(false)
                      if (item.external || !onNavigate) return
                      event.preventDefault()
                      onNavigate(item.href)
                    }}
                    className={cn(menuRow, item.active && 'bg-muted text-foreground')}
                  >
                    <Icon className="size-4" />
                    {item.label}
                  </a>
                )
              })}
            </div>
          )}
          {theme && (
            <div className={cn(onSignOut && 'border-b')}>
              <ThemeSwitch theme={theme} className={cn(menuRow, 'hover:bg-transparent')} />
            </div>
          )}
          {onSignOut && (
            <button type="button" role="menuitem" onClick={onSignOut} className={menuRow}>
              <LogOut className="size-4" />
              Sign out
            </button>
          )}
        </div>
      )}
    </div>
  )
}
