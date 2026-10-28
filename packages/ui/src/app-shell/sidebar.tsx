import { Fragment, type ComponentType, type ReactNode } from 'react'
import { LogIn } from 'lucide-react'
import { cn } from '../lib/cn'
import { RouteLink, type RouteTarget } from '../primitives/route-link'
import { Logo, type ShellLogoProps } from './logo'
import { navGroups as defaultGroups, type NavGroup } from './nav'
import { ProfileMenu, type ProfileMenuItem, type ProfileOrganizations, type ProfileRoles, type ShellUser } from './profile-menu'
import { ThemeSwitch, type ProfileTheme } from './theme-switch'
import { SidebarCreateLink } from './sidebar-create-link'
import { SidebarGroup } from './sidebar-group'
import { SidebarItem } from './sidebar-item'
import { isTextMode, sidebarWidth, type SidebarMode } from './sidebar-mode'
import { text } from './messages'

export type SidebarProps = {
  mode: SidebarMode
  activeItem: string
  /** The signed-in person; without one the footer links to `signIn`. */
  user?: ShellUser
  workspace?: string
  /** The app's name, which the logo shows. */
  appName?: string
  /** The app's own icon, which the logo shows in place of Protobase's mark. */
  appIcon?: string
  forceExpanded?: boolean
  profileMenuOpen?: boolean
  /** Resources to list; defaults to the sample ERP navigation. */
  groups?: NavGroup[]
  /** The app's own pages in the profile menu, above "Sign out", in groups split by a line. */
  userMenu?: ProfileMenuItem[][]
  /** The person's account page, which the name and email at the top of the profile menu link to. */
  account?: string
  onNavigate?: (href: string) => void
  onSignOut?: () => void
  /** The sign-in page, a link in the footer for someone signed out. */
  signIn?: RouteTarget
  organizations?: ProfileOrganizations
  roles?: ProfileRoles
  /** The light, dark or system switch: in the profile menu, or above "Sign in" for someone signed out. */
  theme?: ProfileTheme
  /** Stays in view, as tall as the screen, while the page scrolls, for a shell whose page scrolls. */
  sticky?: boolean
  /** Drawn at the top in place of Protobase's logo. */
  logo?: ComponentType<ShellLogoProps>
  /** Across the bottom, directly above the profile. */
  notice?: ReactNode
}

export const Sidebar = ({ mode, activeItem, user, workspace, appName, appIcon, forceExpanded, profileMenuOpen, groups = defaultGroups, userMenu, account, onNavigate, onSignOut, signIn, organizations, roles, theme, sticky, logo: SidebarLogo = Logo, notice }: SidebarProps) => {
  const expanding = mode === 'icon-expand'
  const expanded = expanding && forceExpanded
  const inline = isTextMode(mode) || expanding
  return (
    <nav aria-label={text('resources')} className={cn(sticky ? 'sticky top-0 h-dvh self-start' : 'relative', 'z-30 shrink-0', sidebarWidth[mode])}>
      <div
        className={cn(
          'group/side absolute inset-y-0 left-0 flex flex-col overflow-hidden border-r bg-sidebar pb-[var(--pb-safe-bottom)] pt-[var(--pb-safe-top)]',
          expanding ? 'w-14 transition-[width,box-shadow] duration-150 hover:w-60 hover:shadow-pop focus-within:w-60 focus-within:shadow-pop' : 'w-full',
          expanded && 'w-60 shadow-pop',
        )}
      >
        <div className={cn('flex h-12 shrink-0 items-center px-3.5', mode === 'icon-label' && 'justify-center px-0')}>
          <SidebarLogo compact={!inline} workspace={workspace} appName={appName} appIcon={appIcon} />
        </div>
        <div className={cn('flex-1 overflow-y-auto overflow-x-hidden pb-2', mode === 'icon-label' ? 'px-2' : 'px-2')}>
          {groups.map((group, index) => (
            <div key={group.label} className={cn('flex flex-col gap-0.5', index > 0 && 'mt-3')}>
              {inline ? (
                group.label && (
                  <div
                    className={cn(
                      'px-3 pb-1 pt-1 text-xs font-medium uppercase tracking-wide text-faint-foreground',
                      expanding && 'h-4 whitespace-nowrap py-0 opacity-0 transition-opacity group-hover/side:opacity-100 group-focus-within/side:opacity-100',
                      expanded && 'opacity-100',
                    )}
                  >
                    {group.label}
                  </div>
                )
              ) : (
                index > 0 && <div className="mx-auto mb-1 h-px w-6 bg-border" />
              )}
              {group.items.map((item) => (
                <Fragment key={item.id}>
                  {item.recent && isTextMode(mode) ? (
                    <SidebarGroup item={item} recent={item.recent} mode={mode} active={item.id === activeItem} onNavigate={onNavigate} />
                  ) : (
                    <SidebarItem item={item} mode={mode} active={item.id === activeItem} onNavigate={onNavigate} />
                  )}
                  {item.create && isTextMode(mode) && <SidebarCreateLink create={item.create} mode={mode} onNavigate={onNavigate} />}
                </Fragment>
              ))}
            </div>
          ))}
        </div>
        {notice}
        <div className={cn('shrink-0 border-t p-2', mode !== 'text-large' && mode !== 'text-small' && !expanding && 'flex justify-center')}>
          {user ? (
            <ProfileMenu user={user} compact={!inline} open={profileMenuOpen} items={userMenu} account={account} onNavigate={onNavigate} onSignOut={onSignOut} organizations={organizations} roles={roles} theme={theme} />
          ) : (
            <>
              {/* An icon-only sidebar has no room for the switch; the page still follows the system or a stored choice. */}
              {theme && inline && <ThemeSwitch theme={theme} className="flex min-h-11 w-full items-center gap-2.5 whitespace-nowrap p-1.5 text-muted-foreground md:min-h-0" />}
              {signIn && (
                <RouteLink to={signIn} aria-label={text('signIn')} className="flex min-h-11 w-full items-center gap-2.5 rounded-md p-1.5 text-left font-medium text-muted-foreground hover:bg-muted hover:text-foreground md:min-h-0">
                  <LogIn className="size-4 shrink-0" />
                  {inline && <span className="whitespace-nowrap">{text('signIn')}</span>}
                </RouteLink>
              )}
            </>
          )}
        </div>
      </div>
    </nav>
  )
}
