import { useEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from '../lib/cn'
import { useIsDesktop } from '../lib/use-media-query'
import { BottomBar, type BottomBarTab } from './bottom-bar'
import { Drawer } from './drawer'
import { PageScrollContext, usePageInsets } from './page-scroll'
import type { NavGroup } from './nav'
import { Sidebar } from './sidebar'
import type { ProfileMenuItem, ProfileOrganizations, ProfileRoles, ShellUser } from './profile-menu'
import type { SidebarMode } from './sidebar-mode'
import type { GlobalSearchModel } from './global-search'
import type { Crumb } from './breadcrumb'
import { TopBar } from './top-bar'

export type AppShellProps = {
  /** Used from the `md` breakpoint up; on phones the sidebar is always the drawer. */
  sidebarMode: SidebarMode
  activeItem: string
  /** Crumbs with an `href` are links, followed with `onNavigate`. */
  breadcrumb: Crumb[]
  /** The signed-in person, with their profile menu; without one the sidebar offers `onSignIn` instead. */
  user?: ShellUser
  workspace?: string
  actions?: ReactNode
  rightPanel?: ReactNode
  forceExpanded?: boolean
  profileMenuOpen?: boolean
  navGroups?: NavGroup[]
  /** The app's own pages in the profile menu, above "Sign out". */
  userMenu?: ProfileMenuItem[]
  onNavigate?: (href: string) => void
  /** Adds "Sign out" to the profile menu. */
  onSignOut?: () => void
  /** A "Sign in" button in the sidebar for a visitor, who has no `user`. */
  onSignIn?: () => void
  /** Tabs along the bottom on phones, before "More", which opens the drawer instead of the top bar's menu button. */
  bottomBar?: BottomBarTab[]
  /** The organizations to switch between, in the profile menu. */
  organizations?: ProfileOrganizations
  /** The roles to switch between, in the profile menu. */
  roles?: ProfileRoles
  /** The top bar's search; without it there is no search box. */
  search?: GlobalSearchModel
  className?: string
  children: ReactNode
}

const drawerId = 'app-drawer'

export const AppShell = ({ sidebarMode, activeItem, breadcrumb, user, workspace, actions, rightPanel, forceExpanded, profileMenuOpen, navGroups, userMenu, bottomBar, onNavigate, onSignOut, onSignIn, organizations, roles, search, className, children }: AppShellProps) => {
  const desktop = useIsDesktop()
  const [drawerOpen, setDrawerOpen] = useState(false)
  useEffect(() => {
    if (desktop) setDrawerOpen(false)
  }, [desktop])
  const tabs = !desktop && bottomBar && bottomBar.length > 0 ? bottomBar : undefined
  // A page that scrolls the document turns it on with `usePageScroll`
  const [pageScroll, setPageScroll] = useState(false)
  const topBarRef = useRef<HTMLElement>(null)
  const bottomBarRef = useRef<HTMLElement>(null)
  usePageInsets(pageScroll, topBarRef, bottomBarRef, Boolean(tabs))
  const sidebar = (mode: SidebarMode, sticky = false) => (
    <Sidebar mode={mode} sticky={sticky} activeItem={activeItem} user={user} workspace={workspace} forceExpanded={forceExpanded} profileMenuOpen={profileMenuOpen} groups={navGroups} userMenu={userMenu} onNavigate={onNavigate} onSignOut={onSignOut} onSignIn={onSignIn} organizations={organizations} roles={roles} />
  )
  return (
    <PageScrollContext.Provider value={setPageScroll}>
      <div className={cn(pageScroll ? 'flex min-h-full w-full overflow-x-clip bg-background' : 'flex h-full min-h-0 w-full overflow-hidden bg-background', className)}>
        {desktop ? sidebar(sidebarMode, pageScroll) : (
          <Drawer id={drawerId} open={drawerOpen} onClose={() => setDrawerOpen(false)}>
            {sidebar('text-large')}
          </Drawer>
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar ref={topBarRef} sticky={pageScroll} breadcrumb={breadcrumb} onNavigate={onNavigate} actions={actions} onMenu={desktop || tabs ? undefined : () => setDrawerOpen(true)} menuOpen={drawerOpen} menuControls={drawerId} search={search} />
          <main className={pageScroll ? 'flex flex-1 flex-col' : 'flex min-h-0 flex-1 flex-col'}>{children}</main>
          {tabs && <BottomBar ref={bottomBarRef} sticky={pageScroll} tabs={tabs} onNavigate={onNavigate} onMore={() => setDrawerOpen(true)} moreOpen={drawerOpen} moreControls={drawerId} />}
        </div>
        {/* The same element either way, so that switching keeps the panel's state; it stays in view while the page scrolls */}
        {rightPanel && <div className={pageScroll ? 'sticky top-0 flex h-dvh shrink-0 self-start' : 'flex shrink-0'}>{rightPanel}</div>}
      </div>
    </PageScrollContext.Provider>
  )
}
