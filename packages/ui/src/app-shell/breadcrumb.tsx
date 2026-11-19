import { ChevronRight } from 'lucide-react'
import type { MouseEvent, ReactNode } from 'react'
import { cn } from '../lib/cn'
import { Skeleton } from '../primitives/skeleton'
import { text } from './messages'

/**
 * One step of the top bar's trail: plain text, or a link when it has a page of its own. A loading crumb shows a skeleton,
 * with its label for screen readers. A last crumb marked `above` is the page the shown one sits under, as a list is
 * above its record: it is not the current page, and on a phone the back button, which goes to it, shows its label.
 */
export type Crumb = string | { label: string; href?: string; loading?: boolean; above?: boolean }

export type BreadcrumbProps = {
  parts: Crumb[]
  /** Follows a crumb's link in the app; modified and middle clicks are left to the browser, so they open a new tab. */
  onNavigate?: (href: string) => void
  /** Right after the current page's name, such as the page's refresh status; the name truncates before it. */
  trailing?: ReactNode
}

/** A plain left click, which the app follows itself; others open a new tab. */
export const inApp = (event: MouseEvent) => event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey

/** The trail of where you are; the current page, the last crumb unless it is `above`, shows on phones too. */
export const Breadcrumb = ({ parts, onNavigate, trailing }: BreadcrumbProps) => {
  // `trailing` follows the current page's title; after the trail when the last crumb is no current page, which a phone
  // hides, so a phone always shows it
  const lastPart = parts.at(-1)
  const endsOnCurrent = lastPart !== undefined && (typeof lastPart === 'string' || !lastPart.above)
  return (
    <nav aria-label={text('breadcrumb')} className="flex min-w-0 items-center gap-1.5">
      {parts.map((part, index) => {
        const last = index === parts.length - 1
        const { label, href, loading, above } = typeof part === 'string' ? { label: part, href: undefined, loading: false, above: false } : part
        const content = loading ? <Skeleton className="w-24" /> : label
        const current = last && !above
        // On a phone the page's title is the bar's large title
        const text = cn('truncate', current ? 'font-semibold max-md:text-mobile-title max-md:font-bold' : 'text-muted-foreground')
        return (
          <span key={`${index}-${label}`} className={cn('min-w-0 items-center gap-1.5', current ? 'flex' : 'hidden md:flex')}>
            {index > 0 && <ChevronRight className="hidden size-3.5 shrink-0 text-faint-foreground md:block" />}
            {href ? (
              <a
                href={href}
                aria-current={current ? 'page' : undefined}
                aria-label={loading ? label : undefined}
                aria-busy={loading || undefined}
                onClick={(event) => {
                  if (!onNavigate || !inApp(event)) return
                  event.preventDefault()
                  onNavigate(href)
                }}
                className={cn(text, 'rounded-sm hover:text-foreground hover:underline')}
              >
                {content}
              </a>
            ) : (
              <span className={text} aria-label={loading ? label : undefined} aria-busy={loading || undefined}>
                {content}
              </span>
            )}
            {current && trailing}
          </span>
        )
      })}
      {!endsOnCurrent && trailing}
    </nav>
  )
}
