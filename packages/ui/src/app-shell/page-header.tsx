import type { ReactNode } from 'react'

export type PageHeaderProps = {
  title: string
  subtitle?: string
  /** Kept right of the title on a desktop, where a long title wraps instead; below it, in one wrapping row, on a phone. */
  actions?: ReactNode
}

export const PageHeader = ({ title, subtitle, actions }: PageHeaderProps) => (
  <div className="flex flex-col gap-x-4 gap-y-2 md:flex-row md:items-end md:justify-between">
    <div className="min-w-0 break-words md:flex-1">
      <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
      {subtitle && <p className="text-muted-foreground">{subtitle}</p>}
    </div>
    {actions && <div className="flex flex-wrap items-center gap-2 md:justify-end">{actions}</div>}
  </div>
)
