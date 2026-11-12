import { ChevronLeft, Menu, Search, X } from 'lucide-react'
import { useLayoutEffect, useRef, useState, type ReactNode, type Ref } from 'react'
import { cn } from '../lib/cn'
import { backTarget } from './back-target'
import { Breadcrumb, inApp, type Crumb } from './breadcrumb'
import { GlobalSearch, type GlobalSearchModel } from './global-search'
import { text } from './messages'

export type TopBarProps = {
  breadcrumb: Crumb[]
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
  /** Gets the element, shown below `md`, that a page's own controls are portalled into (see `useTopBarSlot`). */
  slotRef?: (element: HTMLDivElement | null) => void
  ref?: Ref<HTMLElement>
}

/**
 * An icon button of the top bar on a mobile screen, as the menu, back and search buttons are. It and its icon grow with
 * the text size beyond their default 44px and 20px only up to 13% and 6% of the screen's width, so four buttons still
 * fit at the largest text sizes, as in a native app's bar. The caps and the bar's spacing are in pixels and screen width,
 * not `rem` as other sizes are, because a size in `rem` alone grows with the text past the screen's width.
 */
export const topBarButton = 'inline-flex size-[min(2.75rem,max(44px,13vw))] shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted md:hidden [&_svg]:size-[min(1.25rem,max(20px,6vw))]'

/**
 * The search field that covers the bar on a mobile screen: like the buttons, it and its icons grow with the text only up
 * to the bar's control height, less its 2px focus ring, so the field and its ring stay inside the bar at the largest text
 * sizes; its text keeps growing.
 */
const mobileSearchField = 'max-h-[max(40px,calc(13vw-4px))] [&>svg]:size-[min(1rem,max(16px,6vw))] [&>button]:size-[min(1.5rem,max(24px,9vw))] [&>button>svg]:size-[min(0.875rem,max(14px,5vw))]'

/** The back button that shows the page it goes to, as the trail on a phone leaves that crumb to it: one link, one target. */
const backWithLabel = 'inline-flex min-h-[min(2.75rem,max(44px,13vw))] min-w-0 items-center gap-[4px] rounded-md pr-[8px] pl-[12px] text-muted-foreground hover:bg-muted hover:text-foreground md:hidden [&_svg]:size-[min(1.25rem,max(20px,6vw))]'

export const TopBar = ({ breadcrumb, onNavigate, onBack, actions, onMenu, menuOpen, menuControls, search, sticky, slotRef, ref }: TopBarProps) => {
  const [searchOpen, setSearchOpen] = useState(false)
  const back = backTarget(breadcrumb)
  const desktopSearch = useRef<HTMLInputElement>(null)

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
      <header ref={ref} className={cn(sticky ? 'sticky top-0 z-30 max-md:fixed max-md:left-[var(--pb-safe-left)] max-md:right-[var(--pb-safe-right)]' : 'relative', 'flex shrink-0 items-center gap-[4px] border-b bg-background pt-[calc(var(--pb-safe-top)+1.5px)] pr-[8px] pb-[1.5px] pl-[16px] md:h-[calc(3rem+var(--pb-safe-top))] md:gap-4 md:px-5 md:pt-[var(--pb-safe-top)] md:pb-0')}>
        {onMenu && (
          <button type="button" aria-label={text('openNavigation')} aria-expanded={Boolean(menuOpen)} aria-controls={menuControls} onClick={onMenu} className={cn(topBarButton, '-ml-[12px]')}>
            <Menu />
          </button>
        )}
        {back && (
          <a
            href={back.href}
            aria-label={text('backTo', { label: back.label })}
            onClick={(event) => {
              const follow = onBack ?? onNavigate
              if (!follow || !inApp(event)) return
              event.preventDefault()
              follow(back.href)
            }}
            className={cn(back.shown ? backWithLabel : topBarButton, !onMenu && '-ml-[12px]')}
          >
            <ChevronLeft className="shrink-0" aria-hidden />
            {back.shown && <span className="truncate">{back.label}</span>}
          </a>
        )}
        <Breadcrumb parts={breadcrumb} onNavigate={onNavigate} />
        <div className="ml-auto flex items-center gap-[4px] md:gap-3">
          {search && (
            <>
              <div className="hidden md:block">
                <GlobalSearch ref={desktopSearch} search={search} />
              </div>
              <button type="button" aria-label={text('search')} aria-expanded={searchOpen} onClick={() => setSearchOpen(true)} className={topBarButton}>
                <Search />
              </button>
          </>
        )}
        {actions}
        <div ref={slotRef} className="contents md:hidden" />
      </div>
      {search && searchOpen && (
        <div className="absolute inset-0 z-20 flex items-center gap-[4px] bg-background px-[12px] pt-[var(--pb-safe-top)] md:hidden">
          <GlobalSearch className="min-w-0 flex-1" fieldClassName={mobileSearchField} autoFocus showShortcut={false} search={{ ...search, onSelect: (href) => { search.onSelect(href); setSearchOpen(false) } }} />
          <button type="button" aria-label={text('closeSearch')} onClick={() => setSearchOpen(false)} className={topBarButton}>
            <X />
          </button>
        </div>
      )}
    </header>
    {sticky && <div aria-hidden className="h-[var(--pb-sticky-top)] shrink-0 md:hidden" />}
    </>
  )
}
