import { cn } from '../lib/cn'
import { Logo } from './logo'
import { navGroups as defaultGroups, type NavGroup } from './nav'
import { ProfileMenu, type ProfileMenuItem, type ProfileOrganizations, type ShellUser } from './profile-menu'
import { SidebarGroup } from './sidebar-group'
import { SidebarItem } from './sidebar-item'
import { isTextMode, sidebarWidth, type SidebarMode } from './sidebar-mode'

export type SidebarProps = {
  mode: SidebarMode
  activeItem: string
  user: ShellUser
  workspace?: string
  forceExpanded?: boolean
  profileMenuOpen?: boolean
  /** Resources to list; defaults to the sample ERP navigation. */
  groups?: NavGroup[]
  /** The app's own pages in the profile menu, above "Sign out". */
  userMenu?: ProfileMenuItem[]
  onNavigate?: (href: string) => void
  onSignOut?: () => void
  organizations?: ProfileOrganizations
}

export const Sidebar = ({ mode, activeItem, user, workspace, forceExpanded, profileMenuOpen, groups = defaultGroups, userMenu, onNavigate, onSignOut, organizations }: SidebarProps) => {
  const expanding = mode === 'icon-expand'
  const expanded = expanding && forceExpanded
  const inline = isTextMode(mode) || expanding
  return (
    <nav aria-label="Resources" className={cn('relative z-30 shrink-0', sidebarWidth[mode])}>
      <div
        className={cn(
          'group/side absolute inset-y-0 left-0 flex flex-col overflow-hidden border-r bg-sidebar',
          expanding ? 'w-14 transition-[width,box-shadow] duration-150 hover:w-60 hover:shadow-pop focus-within:w-60 focus-within:shadow-pop' : 'w-full',
          expanded && 'w-60 shadow-pop',
        )}
      >
        <div className={cn('flex h-12 shrink-0 items-center px-3.5', mode === 'icon-label' && 'justify-center px-0')}>
          <Logo showName={isTextMode(mode) || expanding} workspace={workspace} />
        </div>
        <div className={cn('flex-1 overflow-y-auto overflow-x-hidden pb-2', mode === 'icon-label' ? 'px-2' : 'px-2')}>
          {groups.map((group, index) => (
            <div key={group.label} className={cn('flex flex-col gap-0.5', index > 0 && 'mt-3')}>
              {inline ? (
                <div
                  className={cn(
                    'px-3 pb-1 pt-1 text-[11px] font-medium uppercase tracking-wide text-faint-foreground',
                    expanding && 'h-4 whitespace-nowrap py-0 opacity-0 transition-opacity group-hover/side:opacity-100 group-focus-within/side:opacity-100',
                    expanded && 'opacity-100',
                  )}
                >
                  {group.label}
                </div>
              ) : (
                index > 0 && <div className="mx-auto mb-1 h-px w-6 bg-border" />
              )}
              {group.items.map((item) =>
                item.recent && isTextMode(mode) ? (
                  <SidebarGroup key={item.id} item={item} recent={item.recent} mode={mode} active={item.id === activeItem} onNavigate={onNavigate} />
                ) : (
                  <SidebarItem key={item.id} item={item} mode={mode} active={item.id === activeItem} onNavigate={onNavigate} />
                ),
              )}
            </div>
          ))}
        </div>
        <div className={cn('shrink-0 border-t p-2', mode !== 'text-large' && mode !== 'text-small' && !expanding && 'flex justify-center')}>
          <ProfileMenu user={user} compact={!inline} open={profileMenuOpen} items={userMenu} onNavigate={onNavigate} onSignOut={onSignOut} organizations={organizations} />
        </div>
      </div>
    </nav>
  )
}
