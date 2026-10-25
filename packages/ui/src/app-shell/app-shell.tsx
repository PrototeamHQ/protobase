import { useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react'
import { cn } from '../lib/cn'
import { useIsDesktop } from '../lib/use-media-query'
import type { RouteTarget } from '../primitives/route-link'
import { BottomBar, type BottomBarTab } from './bottom-bar'
import { Drawer } from './drawer'
import { PageScrollContext, usePageGutter, usePageInsets } from './page-scroll'
import type { NavGroup } from './nav'
import { Sidebar } from './sidebar'
import { useSidebarNoticeShown } from './sidebar-notice'
import type { ProfileMenuItem, ProfileOrganizations, ProfileRoles, ShellUser } from './profile-menu'
import type { ProfileTheme } from './theme-switch'
import type { SidebarMode } from './sidebar-mode'
import type { GlobalSearchModel } from './global-search'
import type { Crumb } from './breadcrumb'
import type { ShellLogoProps } from './logo'
import { TopBarSlotContext } from './top-bar-slot'
import { TopBar } from './top-bar'

export type AppShellProps = {
  /** Used from the `md` breakpoint up; on phones the sidebar is always the drawer. */
  sidebarMode: SidebarMode
  activeItem: string
  /** Crumbs with an `href` are links, followed with `onNavigate`. */
  breadcrumb: Crumb[]
  /** The signed-in person, with their profile menu; without one the sidebar links to `signIn` instead. */
  user?: ShellUser
  workspace?: string
  /** The app's name, which the sidebar's logo shows. */
  appName?: string
  /** The app's own icon, which the sidebar's logo draws in place of Protobase's mark. */
  appIcon?: string
  /** Drawn at the top of the sidebar in place of Protobase's logo. */
  logo?: ComponentType<ShellLogoProps>
  actions?: ReactNode
  rightPanel?: ReactNode
  /** Across the bottom of the sidebar, above the profile, only where the sidebar shows at full width (see `useSidebarNoticeShown`). */
  sidebarNotice?: ReactNode
  /** Across the page directly below the top bar, such as an app's notices: clear of a phone's status bar and camera as the top bar is. */
  banner?: ReactNode
  forceExpanded?: boolean
  profileMenuOpen?: boolean
  navGroups?: NavGroup[]
  /** The app's own pages in the profile menu, above "Sign out", in groups split by a line. */
  userMenu?: ProfileMenuItem[][]
  /** The person's account page, which the name and email at the top of the profile menu link to. */
  account?: string
  onNavigate?: (href: string) => void
  /** Follows the top bar's back button, as the browser's Back where the page before is where it leads; without it `onNavigate`. */
  onBack?: (href: string) => void
  /** Adds "Sign out" to the profile menu. */
  onSignOut?: () => void
  /** The sign-in page, a "Sign in" link in the sidebar for a visitor, who has no `user`. */
  signIn?: RouteTarget
  /** Tabs along the bottom on phones, before "More", which opens the drawer instead of the top bar's menu button. */
  bottomBar?: BottomBarTab[]
  /** The organizations to switch between, in the profile menu. */
  organizations?: ProfileOrganizations
  /** The roles to switch between, in the profile menu. */
  roles?: ProfileRoles
  /** The light, dark or system switch, in the profile menu. */
  theme?: ProfileTheme
  /** The top bar's search; without it there is no search box. */
  search?: GlobalSearchModel
  /** Whether the document scrolls on a page that does not choose with `usePageScroll`; otherwise the page fills a box of the screen's height. */
  pageScroll?: boolean
  className?: string
  children: ReactNode
}

const drawerId = 'app-drawer'

export const AppShell = ({ sidebarMode, activeItem, breadcrumb, user, workspace, appName, appIcon, logo, actions, rightPanel, sidebarNotice, banner, forceExpanded, profileMenuOpen, navGroups, userMenu, account, bottomBar, onNavigate, onBack, onSignOut, signIn, organizations, roles, theme, search, pageScroll: scrollsByDefault = false, className, children }: AppShellProps) => {
  const desktop = useIsDesktop()
  const noticeShown = useSidebarNoticeShown(sidebarMode)
  const [drawerOpen, setDrawerOpen] = useState(false)
  useEffect(() => {
    if (desktop) setDrawerOpen(false)
  }, [desktop])
  const tabs = !desktop && bottomBar && bottomBar.length > 0 ? bottomBar : undefined
  // A page turns the document's scrolling on or off with `usePageScroll`
  const [chosen, setPageScroll] = useState<boolean>()
  const pageScroll = chosen ?? scrollsByDefault
  const topBarRef = useRef<HTMLElement>(null)
  const [topBarSlot, setTopBarSlot] = useState<HTMLElement | null>(null)
  const bottomBarRef = useRef<HTMLElement>(null)
  usePageInsets(pageScroll, topBarRef, bottomBarRef, Boolean(tabs))
  usePageGutter(pageScroll)
  const sidebar = (mode: SidebarMode, sticky = false, notice?: ReactNode) => (
    <Sidebar mode={mode} sticky={sticky} notice={notice} activeItem={activeItem} user={user} workspace={workspace} appName={appName} appIcon={appIcon} forceExpanded={forceExpanded} profileMenuOpen={profileMenuOpen} groups={navGroups} userMenu={userMenu} account={account} onNavigate={onNavigate} onSignOut={onSignOut} signIn={signIn} organizations={organizations} roles={roles} theme={theme} logo={logo} />
  )
  return (
    <PageScrollContext.Provider value={setPageScroll}>
      {/* Relative while a box scrolls, so that it clips absolute content such as sr-only text, which otherwise makes the document taller */}
      <div className={cn(pageScroll ? 'flex min-h-full w-full overflow-x-clip bg-background' : 'relative flex h-full min-h-0 w-full overflow-hidden bg-background', className)}>
        {desktop ? sidebar(sidebarMode, pageScroll, noticeShown && sidebarNotice) : (
          <Drawer id={drawerId} open={drawerOpen} onClose={() => setDrawerOpen(false)}>
            {sidebar('text-large')}
          </Drawer>
        )}
        {/* Without the bottom bar, the page keeps clear of the home indicator itself */}
        <div className={cn('flex min-w-0 flex-1 flex-col', !tabs && 'pb-[var(--pb-safe-bottom)]')}>
          <TopBar ref={topBarRef} slotRef={setTopBarSlot} sticky={pageScroll} breadcrumb={breadcrumb} onNavigate={onNavigate} onBack={onBack} actions={actions} onMenu={desktop || tabs ? undefined : () => setDrawerOpen(true)} menuOpen={drawerOpen} menuControls={drawerId} search={search} />
          {banner}
          <main className={pageScroll ? 'flex flex-1 flex-col' : 'flex min-h-0 flex-1 flex-col'}>
            <TopBarSlotContext.Provider value={topBarSlot}>{children}</TopBarSlotContext.Provider>
          </main>
          {tabs && <BottomBar ref={bottomBarRef} sticky={pageScroll} tabs={tabs} onNavigate={onNavigate} onMore={() => setDrawerOpen(true)} moreOpen={drawerOpen} moreControls={drawerId} />}
        </div>
        {/* The same element either way, so that switching keeps the panel's state; it stays in view while the page scrolls */}
        {rightPanel && <div className={pageScroll ? 'sticky top-0 flex h-dvh shrink-0 self-start pt-[var(--pb-safe-top)]' : 'flex shrink-0'}>{rightPanel}</div>}
      </div>
    </PageScrollContext.Provider>
  )
}
