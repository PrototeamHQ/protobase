import { Ellipsis, Search, type LucideIcon } from 'lucide-react'
import { useImperativeHandle, useRef, type MouseEvent, type Ref } from 'react'
import { cn } from '../lib/cn'
import { text } from './messages'
import { useNativeBottomBar } from './use-native-bottom-bar'


/** A tab: inside the admin it navigates, `external` opens a new tab. */
export type BottomBarTab = { id: string; label: string; icon: LucideIcon; href: string; external?: boolean; active?: boolean }

export type BottomBarProps = {
  tabs: BottomBarTab[]
  /** Follows a tab that is not `external`; modified clicks are left to the browser. */
  onNavigate?: (href: string) => void
  /**
   * Search, as a tab before "More", where the app put search in the bottom bar; none without it. It takes the last tab's
   * place, which "More" then holds, except under the native tab bar, which draws it apart from the tabs.
   */
  onSearch?: () => void
  /** Search's label; "Search" when omitted. */
  searchLabel?: string
  /** "More": opens the navigation drawer. */
  onMore: () => void
  moreOpen: boolean
  moreControls: string
  /**
   * Stays at the bottom of the page while it scrolls, for a shell whose page scrolls: fixed, over a spacer of its
   * height, so it stays put while the page is pulled past its end as well, as an iOS app's tab bar does.
   */
  sticky?: boolean
  ref?: Ref<HTMLElement>
}

const inApp = (event: MouseEvent) => event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey

const tab = 'flex min-h-[49px] min-w-0 flex-1 flex-col items-center justify-center gap-1 pb-1 pt-1.5 text-[0.625rem] font-medium leading-none'

/**
 * Tabs along the bottom of a phone, as on iOS: icon above label, the current screen in the accent colour, and "More"
 * last, which opens the navigation drawer and is the current tab on screens the others do not hold. The padding below
 * keeps the tabs clear of the iPhone home indicator. In an app whose bridge offers a native tab bar, that bar draws
 * the tabs (`useNativeBottomBar`) and this one keeps its place, unseen.
 */
export const BottomBar = ({ tabs, onNavigate, onSearch, searchLabel, onMore, moreOpen, moreControls, sticky, ref }: BottomBarProps) => {
  // Five places at most: beside search one tab fewer fits (bottomBarErrors)
  const moreCurrent = !tabs.some((item) => item.active)
  const own = useRef<HTMLElement>(null)
  useImperativeHandle(ref, () => own.current as HTMLElement)
  const labels = [...tabs.map((item) => item.label), ...(onSearch ? [searchLabel ?? text('search')] : []), text('more')]
  const more = labels.length - 1
  const { native, height } = useNativeBottomBar(own, labels, moreCurrent ? more : tabs.findIndex((item) => item.active), onSearch ? tabs.length : undefined)
  return (
    <>
      {sticky && <div aria-hidden className="h-[var(--pb-sticky-bottom)] shrink-0 md:hidden" />}
      <nav ref={own} aria-label={text('tabs')} aria-hidden={native || undefined} className={cn('flex shrink-0 border-t bg-background pb-[var(--pb-safe-bottom)] md:hidden', sticky && 'fixed bottom-0 left-[var(--pb-safe-left)] right-[var(--pb-safe-right)] z-30', native && 'invisible')} style={native && height !== undefined ? { height } : undefined}>
        {tabs.map((item) => {
          const Icon = item.icon
          return (
            <a
              key={item.id}
              href={item.href}
              aria-current={item.active ? 'page' : undefined}
              {...(item.external ? { target: '_blank', rel: 'noreferrer' } : {})}
              onClick={(event) => {
                if (item.external || !onNavigate || !inApp(event)) return
                event.preventDefault()
                onNavigate(item.href)
              }}
              className={cn(tab, item.active ? 'text-primary-text' : 'text-muted-foreground')}
            >
              <Icon className="size-6" strokeWidth={item.active ? 2.2 : 1.9} aria-hidden />
              <span className="max-w-full truncate px-0.5">{item.label}</span>
            </a>
          )
        })}
        {onSearch && (
          <button type="button" onClick={onSearch} className={cn(tab, 'text-muted-foreground')}>
            <Search className="size-6" strokeWidth={1.9} aria-hidden />
            {searchLabel ?? text('search')}
          </button>
        )}
        <button type="button" aria-expanded={moreOpen} aria-controls={moreControls} data-current={moreCurrent || undefined} onClick={onMore} className={cn(tab, moreCurrent ? 'text-primary-text' : 'text-muted-foreground')}>
          <Ellipsis className="size-6" strokeWidth={moreCurrent ? 2.2 : 1.9} aria-hidden />
          {text('more')}
        </button>
      </nav>
    </>
  )
}
