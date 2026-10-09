import { ChevronRight } from 'lucide-react'
import type { MouseEvent } from 'react'
import { cn } from '../lib/cn'

/** One step of the top bar's trail: plain text, or a link when it has a page of its own. */
export type Crumb = string | { label: string; href?: string }

export type BreadcrumbProps = {
  parts: Crumb[]
  /** Follows a crumb's link in the app; modified and middle clicks are left to the browser, so they open a new tab. */
  onNavigate?: (href: string) => void
}

const inApp = (event: MouseEvent) => event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey

/** The trail of where you are; the last crumb, the current page, shows on phones too. */
export const Breadcrumb = ({ parts, onNavigate }: BreadcrumbProps) => (
  <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-[13px]">
    {parts.map((part, index) => {
      const last = index === parts.length - 1
      const { label, href } = typeof part === 'string' ? { label: part, href: undefined } : part
      const text = cn('truncate', last ? 'font-semibold' : 'text-muted-foreground')
      return (
        <span key={`${index}-${label}`} className={cn('min-w-0 items-center gap-1.5', last ? 'flex' : 'hidden md:flex')}>
          {index > 0 && <ChevronRight className="hidden size-3.5 shrink-0 text-faint-foreground md:block" />}
          {href ? (
            <a
              href={href}
              aria-current={last ? 'page' : undefined}
              onClick={(event) => {
                if (!onNavigate || !inApp(event)) return
                event.preventDefault()
                onNavigate(href)
              }}
              className={cn(text, 'rounded-sm hover:text-foreground hover:underline')}
            >
              {label}
            </a>
          ) : (
            <span className={text}>{label}</span>
          )}
        </span>
      )
    })}
  </nav>
)
