import { Ellipsis, type LucideIcon } from 'lucide-react'
import type { MouseEvent, Ref } from 'react'
import { cn } from '../lib/cn'
import { text } from './messages'

/** A tab: inside the admin it navigates, `external` opens a new tab. */
export type BottomBarTab = { id: string; label: string; icon: LucideIcon; href: string; external?: boolean; active?: boolean }

export type BottomBarProps = {
  tabs: BottomBarTab[]
  /** Follows a tab that is not `external`; modified clicks are left to the browser. */
  onNavigate?: (href: string) => void
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

const tab = 'flex min-h-[49px] min-w-0 flex-1 flex-col items-center justify-center gap-1 pb-1 pt-1.5 text-[10px] font-medium leading-none'

/**
 * Tabs along the bottom of a phone, as on iOS: icon above label, the current screen in the accent colour, and "More"
 * last, which opens the navigation drawer and is the current tab on screens the others do not hold. The padding below
 * keeps the tabs clear of the iPhone home indicator.
 */
export const BottomBar = ({ tabs, onNavigate, onMore, moreOpen, moreControls, sticky, ref }: BottomBarProps) => {
  const moreCurrent = !tabs.some((item) => item.active)
  return (
    <>
      {sticky && <div aria-hidden className="h-[var(--pb-sticky-bottom)] shrink-0 md:hidden" />}
      <nav ref={ref} aria-label={text('tabs')} className={cn('flex shrink-0 border-t bg-background pb-[var(--pb-safe-bottom)] md:hidden', sticky && 'fixed bottom-0 left-[var(--pb-safe-left)] right-[var(--pb-safe-right)] z-30')}>
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
        <button type="button" aria-expanded={moreOpen} aria-controls={moreControls} data-current={moreCurrent || undefined} onClick={onMore} className={cn(tab, moreCurrent ? 'text-primary-text' : 'text-muted-foreground')}>
          <Ellipsis className="size-6" strokeWidth={moreCurrent ? 2.2 : 1.9} aria-hidden />
          {text('more')}
        </button>
      </nav>
    </>
  )
}
