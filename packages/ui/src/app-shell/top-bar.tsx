import { Menu, Search, X } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from '../lib/cn'
import { Breadcrumb, type Crumb } from './breadcrumb'
import { GlobalSearch, type GlobalSearchModel } from './global-search'

export type TopBarProps = {
  breadcrumb: Crumb[]
  /** Follows a breadcrumb link in the app. */
  onNavigate?: (href: string) => void
  actions?: ReactNode
  /** Opens the navigation drawer; the button only shows below `md`. */
  onMenu?: () => void
  menuOpen?: boolean
  menuControls?: string
  /** The search box; without it the top bar has none. */
  search?: GlobalSearchModel
}

const iconButton = 'inline-flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted md:hidden'

export const TopBar = ({ breadcrumb, onNavigate, actions, onMenu, menuOpen, menuControls, search }: TopBarProps) => {
  const [searchOpen, setSearchOpen] = useState(false)
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
    <header className="relative flex h-12 shrink-0 items-center gap-1 border-b bg-background px-2 md:gap-4 md:px-5">
      {onMenu && (
        <button type="button" aria-label="Open navigation" aria-expanded={Boolean(menuOpen)} aria-controls={menuControls} onClick={onMenu} className={cn(iconButton, '-ml-0.5')}>
          <Menu className="size-5" />
        </button>
      )}
      <Breadcrumb parts={breadcrumb} onNavigate={onNavigate} />
      <div className="ml-auto flex items-center gap-1 md:gap-3">
        {search && (
          <>
            <div className="hidden md:block">
              <GlobalSearch ref={desktopSearch} search={search} />
            </div>
            <button type="button" aria-label="Search" aria-expanded={searchOpen} onClick={() => setSearchOpen(true)} className={iconButton}>
              <Search className="size-5" />
            </button>
          </>
        )}
        {actions}
      </div>
      {search && searchOpen && (
        <div className="absolute inset-0 z-20 flex items-center gap-1 bg-background px-3 md:hidden">
          <GlobalSearch className="min-w-0 flex-1" autoFocus showShortcut={false} search={{ ...search, onSelect: (href) => { search.onSelect(href); setSearchOpen(false) } }} />
          <button type="button" aria-label="Close search" onClick={() => setSearchOpen(false)} className={iconButton}>
            <X className="size-5" />
          </button>
        </div>
      )}
    </header>
  )
}
