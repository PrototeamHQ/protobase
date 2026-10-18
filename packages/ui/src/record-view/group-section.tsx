import { ChevronRight } from 'lucide-react'
import { useId, type ReactNode } from 'react'
import type { AppAddress } from '@protobase/schema'
import { cn } from '../lib/cn'
import { AppLink } from '../app/use-app-address'

const headingClass = 'text-[16px] font-semibold text-foreground'

/**
 * A heading over sections of the record page. With `toggle`, the address that opens or closes it, the heading is a
 * link, so a copied link opens the page with the group open; the items show only while `open`. Without it the group
 * is always open.
 */
export const GroupSection = ({ title, open, toggle, children }: { title: string; open: boolean; toggle?: AppAddress; children: ReactNode }) => {
  const id = useId()
  return (
    <div>
      <h2 className={cn('py-8', open && 'pb-0')}>
        {toggle ? (
          <AppLink to={toggle} replace aria-expanded={open} aria-controls={id} className={cn('inline-flex items-center gap-1.5', headingClass)}>
            <ChevronRight className={cn('size-4 transition-transform', open && 'rotate-90')} />
            {title}
          </AppLink>
        ) : (
          <span className={headingClass}>{title}</span>
        )}
      </h2>
      {open && (
        <div id={id} className="divide-y divide-border">
          {children}
        </div>
      )}
    </div>
  )
}
