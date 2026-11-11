import { ChevronRight } from 'lucide-react'
import { useId, type ReactNode } from 'react'
import type { AppAddress } from '@protobase/schema'
import { cn } from '../lib/cn'
import { AppLink } from '../app/use-app-address'

const headingClass = 'text-base font-semibold text-foreground'

type GroupSectionProps = { title: string; help?: string; count?: ReactNode; open: boolean; toggle?: AppAddress; children: ReactNode }

/**
 * A heading over sections of the record page, `count` after its title and `help` under it. With `toggle`, the address
 * that opens or closes it, the heading is a link, so a copied link opens the page with the group open; the items show
 * only while `open`. Without it the group is always open.
 */
export const GroupSection = ({ title, help, count, open, toggle, children }: GroupSectionProps) => {
  const id = useId()
  return (
    <div>
      <div className={cn('py-8', open && 'pb-0')}>
        <h2 className="flex items-center gap-2">
          {toggle ? (
            <AppLink to={toggle} replace aria-expanded={open} aria-controls={id} className={cn('inline-flex items-center gap-1.5', headingClass)}>
              <ChevronRight className={cn('size-4 transition-transform', open && 'rotate-90')} />
              {title}
            </AppLink>
          ) : (
            <span className={headingClass}>{title}</span>
          )}
          {count}
        </h2>
        {help && <p className={cn('mt-1 max-w-xl leading-6 text-muted-foreground', toggle && 'pl-5.5')}>{help}</p>}
      </div>
      {open && (
        <div id={id} className="divide-y divide-border">
          {children}
        </div>
      )}
    </div>
  )
}
