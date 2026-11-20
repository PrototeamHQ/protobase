import { useCallback, useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react'
import { cn } from '../lib/cn'
import { useIsDesktop } from '../lib/use-media-query'
import type { RouteTarget } from '../primitives/route-link'
import { BottomBar, type BottomBarTab } from './bottom-bar'
import { useCloseSidebarEvent } from './close-sidebar'
import { Drawer, type DrawerControl } from './drawer'
import { backTarget } from './back-target'
import { declaredEdgeSwipe, edgeSwipeAction, useDeclaredEdgeSwipe, useNativeBackSwipe } from './edge-swipe'
import { useEdgeSwipe } from './use-edge-swipe'
import { PageScrollContext, usePageGutter, usePageInsets } from './page-scroll'
import type { NavGroup } from './nav'
import { Sidebar, type SidebarProps } from './sidebar'
import { useSidebarNoticeShown } from './sidebar-notice'
import type { ProfileMenuItem, ProfileOrganizations, ProfileRoles, ProfileStatus, ShellUser } from './profile-menu'
import type { ProfileTheme } from './theme-switch'
import type { SidebarMode } from './sidebar-mode'
import type { GlobalSearchModel } from './global-search'
import type { Crumb } from './breadcrumb'
import type { ShellLogoProps } from './logo'
import { TopBarSlotContext } from './top-bar-slot'
import { TopBar } from './top-bar'
import { useMenuPageBackground } from './menu-page'
import { accountInTopBar, phoneAppLook, searchPlacement, useMorePageMode } from './more-page'
import { useBrandStatusBar } from './brand-status-bar'
import { Logo } from './logo'
import { tellLogoTap } from './logo-tap'
import { AccountEntry } from './account-entry'
import { text } from './messages'

export type AppShellProps = {
  /** Used from the `md` breakpoint up; on phones the sidebar is always the drawer. */
  sidebarMode: SidebarMode
  activeItem: string
  /** Crumbs with an `href` are links, followed with `onNavigate`. */
  breadcrumb: Crumb[]
  /** Beside the page's title in the top bar, such as a spinner while the page refreshes. */
  titleStatus?: ReactNode
  /**
   * The page shows data that may be out of date, such as from the start cache: muted and pulsing while it is
   * `refreshing`, muted once that `failed`. Only its look changes, so nothing moves when fresh data replaces it.
   */
  staleContent?: 'refreshing' | 'failed'
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
  /** The person's own status in the profile menu: its mark by their name, and the item that sets it. */
  status?: ProfileStatus
  navGroups?: NavGroup[]
  /** The app's own pages in the profile menu, above "Sign out", in groups split by a line. */
  userMenu?: ProfileMenuItem[][]
  /** The person's account page, which the name and email at the top of the profile menu link to. */
  account?: string
  onNavigate?: (href: string) => void
  /** Follows the top bar's back button, as the browser's Back where the page before is where it leads; without it `onNavigate`. */
  onBack?: (href: string) => void
  /** Whether `onBack` to that href is the browser's Back, the history entry behind being that page; the host app's back swipe is used only then. */
  backIsHistory?: (href: string) => boolean
  /** Adds "Sign out" to the profile menu. */
  onSignOut?: () => void
  /** The sign-in page, a "Sign in" link in the sidebar for a visitor, who has no `user`. */
  signIn?: RouteTarget
  /** Tabs along the bottom on phones, before "More", which opens the drawer instead of the top bar's menu button. */
  bottomBar?: BottomBarTab[]
  /**
   * The sidebar as a page of its own, at `href`, and whether the address is it (`shown`): where the native tab bar draws
   * the bottom bar, "More" goes there rather than sliding the sidebar over the page.
   */
  menuPage?: { href: string; shown: boolean }
  /** Search in the bottom bar (`m.search`), with its label or `true` for the default one, in More page mode; none keeps it out. */
  bottomBarSearch?: string | true
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
  /** Mounted on every page, the sidebar's own page too, such as dialogs and incoming calls, which `children` are not. */
  overlays?: ReactNode
  children: ReactNode
}

const drawerId = 'app-drawer'

// Real content that cannot pass for up to date: a skeleton's pulse over muted content while it refreshes, muted alone
// once refreshing failed or when less motion is asked for
const staleLook = {
  refreshing: '[animation:pb-stale_1.4s_ease-in-out_infinite] motion-reduce:[animation:none] motion-reduce:opacity-60',
  failed: 'opacity-60',
}

export const AppShell = ({ sidebarMode, activeItem, breadcrumb, titleStatus, staleContent, user, workspace, appName, appIcon, logo, actions, rightPanel, sidebarNotice, banner, forceExpanded, profileMenuOpen, navGroups, userMenu, account, bottomBar, menuPage, bottomBarSearch, onNavigate, onBack, backIsHistory, onSignOut, signIn, organizations, roles, theme, status, search, pageScroll: scrollsByDefault = false, className, overlays, children }: AppShellProps) => {
  const desktop = useIsDesktop()
  const noticeShown = useSidebarNoticeShown(sidebarMode)
  const [drawerOpen, setDrawerOpen] = useState(false)
  // Opened by a swipe from the edge, which it then follows, rather than by the menu button
  const [drawerUnderFinger, setDrawerUnderFinger] = useState(false)
  const drawerControl = useRef<DrawerControl | null>(null)
  const closeDrawer = useCallback(() => {
    setDrawerOpen(false)
    setDrawerUnderFinger(false)
  }, [])
  useEffect(() => {
    if (desktop) closeDrawer()
  }, [desktop, closeDrawer])
  useCloseSidebarEvent(closeDrawer)
  const tabs = !desktop && bottomBar && bottomBar.length > 0 ? bottomBar : undefined
  // On a phone with a bottom bar, "More" opens the sidebar as its own page, the tabs' pages show the account, search is
  // part of the bottom bar and other pages lead back to More: all from this one decision
  const more = useMorePageMode(tabs, menuPage)
  const accountOnTop = accountInTopBar(desktop)
  const phoneLook = phoneAppLook(desktop)
  const onMore = more.on && onNavigate ? () => onNavigate(more.href) : () => setDrawerOpen(true)
  const menuShown = more.on && more.shown
  useMenuPageBackground(menuShown)
  const [searchOpen, setSearchOpen] = useState(false)
  // The top bar is in the brand colour on a phone (phoneAppLook), and the status bar's text reads over it
  const brandProbe = useRef<HTMLSpanElement>(null)
  const ShellLogo = logo ?? Logo
  useBrandStatusBar(phoneLook, brandProbe)
  // In More page mode the top bar has no search: the bottom bar has it where the app put it there, the More page otherwise
  const searchAt = search && searchPlacement({ desktop, more: more.on, inBottomBar: Boolean(bottomBarSearch) })
  const searchInBar = searchAt === 'bottom-bar'
  const openSearch = () => setSearchOpen(true)
  // In More page mode: the More page is titled "More", a page that is no tab leads back to it, and the first tab leads
  // with the app's logo and name
  const trail = !more.on ? breadcrumb : more.shown ? [text('more')] : more.onTab ? breadcrumb : [{ label: text('more'), href: more.href }, ...breadcrumb]
  const firstTabShown = more.on && Boolean(tabs?.[0]?.shown)
  // A swipe from the left edge goes back a step, opens the drawer, or is left to the host app, as one rule decides; the
  // host app learns which ahead of each gesture
  const back = backTarget(trail)
  const edgeSwipe = edgeSwipeAction({ desktop, back: Boolean(back), bottomBar: Boolean(tabs), drawerOpen })
  // The host app's back swipe shows the entry behind from its snapshot, so only where that is the step back
  const declared = declaredEdgeSwipe(edgeSwipe, { nativeBack: useNativeBackSwipe(), behindIsBack: back !== undefined && Boolean(backIsHistory?.(back.href)) })
  useDeclaredEdgeSwipe(declared, JSON.stringify(trail))

  // A page turns the document's scrolling on or off with `usePageScroll`
  const [chosen, setPageScroll] = useState<boolean>()
  const pageScroll = chosen ?? scrollsByDefault
  const topBarRef = useRef<HTMLElement>(null)
  useEdgeSwipe({
    action: declared,
    onBack: () => back && (onBack ?? onNavigate)?.(back.href),
    openDrawer: () => {
      setDrawerUnderFinger(true)
      setDrawerOpen(true)
    },
    drawer: drawerControl,
  })
  const [topBarSlot, setTopBarSlot] = useState<HTMLElement | null>(null)
  const bottomBarRef = useRef<HTMLElement>(null)
  usePageInsets(pageScroll, topBarRef, bottomBarRef, Boolean(tabs))
  usePageGutter(pageScroll)
  const sidebar = (place: Pick<SidebarProps, 'mode' | 'sticky' | 'notice' | 'fill' | 'page'>) => (
    <Sidebar {...place} accountInTopBar={accountOnTop} {...(place.page && search && searchAt === 'more-page' && { search })} activeItem={activeItem} user={user} workspace={workspace} appName={appName} appIcon={appIcon} forceExpanded={forceExpanded} profileMenuOpen={profileMenuOpen} groups={navGroups} userMenu={userMenu} account={account} onNavigate={onNavigate} onSignOut={onSignOut} signIn={signIn} organizations={organizations} roles={roles} theme={theme} status={status} logo={logo} />
  )
  return (
    <PageScrollContext.Provider value={setPageScroll}>
      <span ref={brandProbe} aria-hidden className="hidden bg-primary" />
      {/* Relative while a box scrolls, so that it clips absolute content such as sr-only text, which otherwise makes the document taller */}
      <div className={cn(pageScroll ? 'flex min-h-full w-full overflow-x-clip' : 'relative flex h-full min-h-0 w-full overflow-hidden', menuShown ? 'bg-sidebar' : 'bg-background', className)}>
        {desktop ? sidebar({ mode: sidebarMode, sticky: pageScroll, notice: noticeShown && sidebarNotice }) : (
          <Drawer id={drawerId} open={drawerOpen} onClose={closeDrawer} underFinger={drawerUnderFinger} control={drawerControl}>
            {sidebar({ mode: 'text-large', fill: true })}
          </Drawer>
        )}
        {/* Without the bottom bar, the page keeps clear of the home indicator itself */}
        <div className={cn('flex min-w-0 flex-1 flex-col', !tabs && 'pb-[var(--pb-safe-bottom)]')}>
          {/* One top bar for every page: on the sidebar's own page it leads with the app's logo and name */}
          <TopBar
            ref={topBarRef}
            slotRef={setTopBarSlot}
            sticky={pageScroll}
            breadcrumb={trail}
            titleStatus={titleStatus}
            onNavigate={onNavigate}
            onBack={onBack}
            actions={actions}
            brand={phoneLook}
            backInLeadingSlot={phoneLook}
            {...(firstTabShown && {
              leading: (
                <div className="flex min-w-0 items-center" onClick={() => tellLogoTap()}>
                  <ShellLogo compact={false} workspace={workspace} appName={appName} appIcon={appIcon} />
                </div>
              ),
            })}
            account={accountOnTop && <AccountEntry onBrand={phoneLook} user={user} signIn={signIn} open={profileMenuOpen} items={userMenu} account={account} onNavigate={onNavigate} onSignOut={onSignOut} organizations={organizations} roles={roles} theme={theme} status={status} />}
            searchButton={searchAt === 'top-bar'}
            searchOpen={searchOpen}
            onSearchOpenChange={setSearchOpen}
            onMenu={desktop || tabs ? undefined : () => setDrawerOpen(true)}
            menuOpen={drawerOpen}
            menuControls={drawerId}
            search={search}
          />
          {banner}
          <main className={cn(pageScroll ? 'flex flex-1 flex-col' : 'flex min-h-0 flex-1 flex-col', staleContent && staleLook[staleContent])} aria-busy={staleContent === 'refreshing' || undefined}>
            <TopBarSlotContext.Provider value={topBarSlot}>
              {menuShown ? sidebar({ mode: 'text-large', page: true }) : children}
              {overlays}
            </TopBarSlotContext.Provider>
          </main>
          {tabs && <BottomBar ref={bottomBarRef} sticky={pageScroll} tabs={tabs} onNavigate={onNavigate} {...(searchInBar && { onSearch: openSearch, searchLabel: bottomBarSearch === true ? undefined : bottomBarSearch })} onMore={onMore} moreOpen={drawerOpen} moreControls={drawerId} />}
        </div>
        {/* The same element either way, so that switching keeps the panel's state; it stays in view while the page scrolls */}
        {rightPanel && <div className={pageScroll ? 'sticky top-0 flex h-dvh shrink-0 self-start pt-[var(--pb-safe-top)]' : 'flex shrink-0'}>{rightPanel}</div>}
      </div>
    </PageScrollContext.Provider>
  )
}
