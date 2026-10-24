import { ChevronLeft, Menu, Search, X } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode, type Ref } from 'react'
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

/** An icon button of the top bar on a mobile screen, as the menu, back and search buttons are. */
export const topBarButton = 'inline-flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted md:hidden'

export const TopBar = ({ breadcrumb, onNavigate, onBack, actions, onMenu, menuOpen, menuControls, search, sticky, slotRef, ref }: TopBarProps) => {
  const [searchOpen, setSearchOpen] = useState(false)
  const back = backTarget(breadcrumb)
  const desktopSearch = useRef<HTMLInputElement>(null)

  // ⌘K (Ctrl+K elsewhere) focuses the search box, or opens it on a phone, where it sits behind a button.
  useEffect(() => {
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
      <header ref={ref} className={cn(sticky ? 'sticky top-0 z-30 max-md:fixed max-md:left-[var(--pb-safe-left)] max-md:right-[var(--pb-safe-right)]' : 'relative', 'flex h-[calc(3rem+var(--pb-safe-top))] shrink-0 items-center gap-1 border-b bg-background pl-4 pr-2 pt-[var(--pb-safe-top)] md:gap-4 md:px-5')}>
        {onMenu && (
          <button type="button" aria-label={text('openNavigation')} aria-expanded={Boolean(menuOpen)} aria-controls={menuControls} onClick={onMenu} className={cn(topBarButton, '-ml-3')}>
            <Menu className="size-5" />
          </button>
        )}
        {back && (
          <a
            href={back.href}
            aria-label={text('backTo', back.label)}
            onClick={(event) => {
              const follow = onBack ?? onNavigate
              if (!follow || !inApp(event)) return
              event.preventDefault()
              follow(back.href)
            }}
            className={cn(topBarButton, !onMenu && '-ml-3')}
          >
            <ChevronLeft className="size-5" />
          </a>
        )}
        <Breadcrumb parts={breadcrumb} onNavigate={onNavigate} />
        <div className="ml-auto flex items-center gap-1 md:gap-3">
          {search && (
            <>
              <div className="hidden md:block">
                <GlobalSearch ref={desktopSearch} search={search} />
              </div>
              <button type="button" aria-label={text('search')} aria-expanded={searchOpen} onClick={() => setSearchOpen(true)} className={topBarButton}>
                <Search className="size-5" />
              </button>
          </>
        )}
        {actions}
        <div ref={slotRef} className="contents md:hidden" />
      </div>
      {search && searchOpen && (
        <div className="absolute inset-0 z-20 flex items-center gap-1 bg-background px-3 pt-[var(--pb-safe-top)] md:hidden">
          <GlobalSearch className="min-w-0 flex-1" autoFocus showShortcut={false} search={{ ...search, onSelect: (href) => { search.onSelect(href); setSearchOpen(false) } }} />
          <button type="button" aria-label={text('closeSearch')} onClick={() => setSearchOpen(false)} className={topBarButton}>
            <X className="size-5" />
          </button>
        </div>
      )}
    </header>
    {sticky && <div aria-hidden className="h-[var(--pb-sticky-top)] shrink-0 md:hidden" />}
    </>
  )
}
