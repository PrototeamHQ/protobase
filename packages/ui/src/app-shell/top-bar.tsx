import { ChevronLeft, Menu, Search, X } from 'lucide-react'
import { useCallback, useLayoutEffect, useRef, useState, type ReactNode, type Ref } from 'react'
import { cn } from '../lib/cn'
import { backTarget } from './back-target'
import { Breadcrumb, inApp, type Crumb } from './breadcrumb'
import { brandBar, brandContent } from './brand-bar'
import { leadingBox, leadingRow } from './leading-slot'
import { GlobalSearch, type GlobalSearchModel } from './global-search'
import { text } from './messages'
import { topBarActions, topBarContent, topBarControl, useNativeTopBarFor } from './use-native-top-bar'

export type TopBarProps = {
  breadcrumb: Crumb[]
  /** Beside the page's title, such as a spinner while the page refreshes. */
  titleStatus?: ReactNode
  /** Follows a breadcrumb link in the app. */
  onNavigate?: (href: string) => void
  /** Follows the back button; without it `onNavigate`. */
  onBack?: (href: string) => void
  actions?: ReactNode
  /** Opens the navigation drawer; the button only shows below `md`. */
  onMenu?: () => void
  menuOpen?: boolean
  menuControls?: string
  /** The search box; without it the top bar has none. */
  search?: GlobalSearchModel
  /**
   * Stays at the top of the page while it scrolls, for a shell whose page scrolls. On a phone it is fixed, over a
   * spacer of its height, so it stays put while the page is pulled past its top as well, as an iOS app's bar does.
   */
  sticky?: boolean
  /** In the app's brand colour on a phone (`brandBar`), up behind the status bar. */
  brand?: boolean
  /** In place of the back link and the trail, such as the app's logo and name on the app's first page. */
  leading?: ReactNode
  /** The back link in the leading slot, in the app logo's place, with the title where the app's name sits (`leadingRow`). */
  backInLeadingSlot?: boolean
  /** At the right end, after the actions, such as the account's entry on a phone. */
  account?: ReactNode
  /** Whether a phone gets a search button here; off where search is part of the bottom bar, which opens it instead. */
  searchButton?: boolean
  /** Whether the phone's search field covers the bar, for a shell that opens it from elsewhere; the bar's own otherwise. */
  searchOpen?: boolean
  onSearchOpenChange?: (open: boolean) => void
  /** Gets the element, shown below `md`, that a page's own controls are portalled into (see `useTopBarSlot`). */
  slotRef?: (element: HTMLDivElement | null) => void
  ref?: Ref<HTMLElement>
}

/**
 * An icon button of the top bar on a mobile screen, as the menu, back and search buttons are. It and its icon grow with
 * the text size beyond their default 44px and 20px only up to 13% and 6% of the screen's width, so four buttons still
 * fit at the largest text sizes, as in a native app's bar. The caps are in pixels and screen width, not `rem` as other
 * sizes are, because a size in `rem` alone grows with the text past the screen's width; the bar's spacing is on the
 * spacing scale, which grows with the text a little.
 */
export const topBarButton = 'inline-flex size-[min(2.75rem,max(44px,13vw))] shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted md:hidden [&_svg]:size-[min(1.25rem,max(20px,6vw))]'

/** The box of any other control at the bar's end, such as the account's avatar, capped as the icon buttons are. */
export const topBarBox = 'size-[min(2.75rem,max(44px,13vw))] shrink-0'

/**
 * The search field that covers the bar on a mobile screen. Its icons grow with the text only up to the bar's control
 * sizes, as the buttons do, and the field itself only up to the bar's control height, less its 2px focus ring, or to its
 * text's line and border when that is taller (`em` is the text's size). Its text sets that line at 1.25 times its size,
 * so the field and its ring stay within the trail's text line, at 1.5 times the same size, that the bar grows with at the
 * largest text sizes.
 */
const mobileSearchField = 'max-h-[max(40px,calc(13vw-4px),calc(1.25em+2px))] text-body [&>input]:leading-[1.25] [&>svg]:size-[min(1rem,max(16px,6vw))] [&>button]:size-[min(1.5rem,max(24px,9vw))] [&>button>svg]:size-[min(0.875rem,max(14px,5vw))]'

/** The back button that shows the page it goes to, as the trail on a phone leaves that crumb to it: one link, one target. */
const backWithLabel = 'inline-flex min-h-[min(2.75rem,max(44px,13vw))] min-w-0 items-center gap-1 rounded-md pr-2 pl-3 text-muted-foreground hover:bg-muted hover:text-foreground md:hidden [&_svg]:size-[min(1.25rem,max(20px,6vw))]'

export const TopBar = ({ breadcrumb, titleStatus, onNavigate, onBack, actions, brand, leading, backInLeadingSlot, account, searchButton = true, searchOpen: openFromOutside, onSearchOpenChange, onMenu, menuOpen, menuControls, search, sticky, slotRef, ref }: TopBarProps) => {
  // Right after the title, never with the account: there from the first frame, so a status that comes and goes, such as
  // the refresh spinner, changes only itself
  const status = <span className="flex shrink-0 items-center empty:hidden">{titleStatus}</span>
  const [ownSearchOpen, setOwnSearchOpen] = useState(false)
  const searchOpen = openFromOutside ?? ownSearchOpen
  const setSearchOpen = (open: boolean) => (onSearchOpenChange ? onSearchOpenChange(open) : setOwnSearchOpen(open))
  const back = backTarget(breadcrumb)
  const desktopSearch = useRef<HTMLInputElement>(null)
  const header = useRef<HTMLElement | null>(null)
  const setHeader = useCallback(
    (element: HTMLElement | null) => {
      header.current = element
      if (typeof ref === 'function') ref(element)
      else if (ref) ref.current = element
    },
    [ref],
  )
  // On a phone app's bar, the app's own navigation bar draws the title, the way back, search and the account, where the
  // bar shows nothing else of its own (`topBarActions`)
  const title = breadcrumb.at(-1)
  const nativeBar = useNativeTopBarFor(header, Boolean(brand) && !searchOpen, typeof title === 'object' ? title.label : (title ?? ''), back?.label, Boolean(onMenu) && !back, Boolean(search) && searchButton)

  // ⌘K (Ctrl+K elsewhere) focuses the search box, or opens it on a phone, where it sits behind a button. A layout effect
  // listens from the commit that shows the bar, so a key pressed right after it renders is not missed.
  useLayoutEffect(() => {
    if (!search) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'k' || !(event.metaKey || event.ctrlKey)) return
      event.preventDefault()
      const input = desktopSearch.current
      if (input && input.offsetParent !== null) input.focus()
      else setSearchOpen(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [search])
  return (
    <>
      <header ref={setHeader} style={nativeBar.native && nativeBar.height !== undefined ? { height: nativeBar.height } : undefined} className={cn(nativeBar.native && 'invisible', sticky ? 'sticky top-0 z-30 max-md:fixed max-md:left-[var(--pb-safe-left)] max-md:right-[var(--pb-safe-right)]' : 'relative', 'flex shrink-0 items-center gap-1 border-b pt-[var(--pb-safe-top,--spacing(2))] pr-2 pb-2 pl-4 h-[calc(3rem+var(--pb-safe-top))] md:gap-4 md:px-5 md:pt-[var(--pb-safe-top)] md:pb-0', brand ? brandBar : 'bg-background')}>
        {/* In the brand colour, what a pull past the page's top reveals above the bar is the bar's colour too */}
        {brand && <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-full h-screen bg-primary md:hidden" />}
        <div {...topBarContent} className={cn('contents', brand && brandContent)}>
        {onMenu && (
          <button type="button" {...topBarControl('menu')} aria-label={text('openNavigation')} aria-expanded={Boolean(menuOpen)} aria-controls={menuControls} onClick={onMenu} className={cn(topBarButton, '-ml-3')}>
            <Menu />
          </button>
        )}
        {leading && (
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            <div className="min-w-0">{leading}</div>
            {status}
          </div>
        )}
        {!leading && backInLeadingSlot && (
          <div className={cn(leadingRow, 'flex-1')}>
            {back && (
              <a
                {...topBarControl('back')}
                href={back.href}
                aria-label={text('backTo', { label: back.label })}
                onClick={(event) => {
                  const follow = onBack ?? onNavigate
                  if (!follow || !inApp(event)) return
                  event.preventDefault()
                  follow(back.href)
                }}
                // The box is the app mark's; the tap area reaches 44 points around it
                className={cn(leadingBox, 'relative flex shrink-0 items-center justify-center rounded-full text-foreground after:absolute after:-inset-2 [&_svg]:size-[min(1.5rem,max(24px,7vw))]')}
              >
                <ChevronLeft aria-hidden />
              </a>
            )}
            <Breadcrumb parts={breadcrumb} onNavigate={onNavigate} trailing={status} />
          </div>
        )}
        {!leading && !backInLeadingSlot && back && (
          <a
            {...topBarControl('back')}
            href={back.href}
            aria-label={text('backTo', { label: back.label })}
            onClick={(event) => {
              const follow = onBack ?? onNavigate
              if (!follow || !inApp(event)) return
              event.preventDefault()
              follow(back.href)
            }}
            className={cn(back.shown ? backWithLabel : topBarButton, !onMenu && '-ml-3')}
          >
            <ChevronLeft className="shrink-0" aria-hidden />
            {back.shown && <span className="truncate">{back.label}</span>}
          </a>
        )}
        {!leading && !backInLeadingSlot && <Breadcrumb parts={breadcrumb} onNavigate={onNavigate} trailing={status} />}
        <div className="ml-auto flex items-center gap-1 md:gap-3">
          {search && (
            <>
              <div className="hidden md:block">
                <GlobalSearch ref={desktopSearch} search={search} />
              </div>
              {searchButton && (
                <button type="button" {...topBarControl('search')} aria-label={text('search')} aria-expanded={searchOpen} onClick={() => setSearchOpen(true)} className={topBarButton}>
                  <Search />
                </button>
              )}
          </>
        )}
        {actions && <div {...topBarActions} className="contents">{actions}</div>}
        <div ref={slotRef} {...topBarActions} className="contents md:hidden" />
        {account && <div {...topBarControl('account')} className="contents">{account}</div>}
      </div>
        </div>
      {search && searchOpen && (
        <div className="absolute inset-0 z-20 flex items-center gap-1 bg-background px-3 pt-[var(--pb-safe-top)] md:hidden">
          <GlobalSearch className="min-w-0 flex-1" fieldClassName={mobileSearchField} autoFocus showShortcut={false} search={{ ...search, onSelect: (href) => { search.onSelect(href); setSearchOpen(false) } }} />
          <button type="button" aria-label={text('closeSearch')} onClick={() => setSearchOpen(false)} className={topBarButton}>
            <X />
          </button>
        </div>
      )}
    </header>
    {/* As tall as the bar from the first frame, before its height is measured: the bar's own, which a taller bar replaces */}
    {sticky && <div aria-hidden className="h-[var(--pb-sticky-top,calc(3rem+var(--pb-safe-top)))] shrink-0 md:hidden" />}
    </>
  )
}
