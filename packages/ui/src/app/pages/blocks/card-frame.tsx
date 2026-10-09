import type { ReactNode } from 'react'
import { cn } from '../../../lib/cn'

/** The card every block that shows a box uses: title, description and header actions over the body. */
export const CardFrame = ({ title, description, actions, className, children }: { title?: string; description?: string; actions?: ReactNode; className?: string; children: ReactNode }) => (
  <section className={cn('flex min-w-0 flex-col rounded-lg border border-border bg-background', className)} aria-label={title}>
    {(title || description || actions) && (
      <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-4 pt-4">
        <div className="min-w-0">
          {title && <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>}
          {description && <p className="mt-0.5 text-[13px] text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </header>
    )}
    <div className="min-w-0 flex-1 p-4 text-[13px]">{children}</div>
  </section>
)

/** A short line in place of content: nothing to show, or not loaded yet. */
export const Quiet = ({ children }: { children: ReactNode }) => <p className="text-[13px] text-muted-foreground">{children}</p>
