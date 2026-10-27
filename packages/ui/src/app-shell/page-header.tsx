import type { ReactNode } from 'react'

export type PageHeaderProps = {
  title: string
  subtitle?: string
  /** Kept right of the title on a desktop, where a long title wraps instead; below it, in one wrapping row, on a phone. */
  actions?: ReactNode
  /** Puts the subtitle on its own full-width line below the title and actions, so the actions sit in the title's row. */
  subtitleBelow?: boolean
}

export const PageHeader = ({ title, subtitle, actions, subtitleBelow }: PageHeaderProps) => {
  if (subtitleBelow) return <StackedPageHeader title={title} subtitle={subtitle} actions={actions} />
  return (
    <div className="flex flex-col gap-x-4 gap-y-2 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0 break-words md:flex-1">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 md:justify-end">{actions}</div>}
    </div>
  )
}

/** The title and actions in one row, which wraps the actions below the title when it runs out of room, then the subtitle. */
const StackedPageHeader = ({ title, subtitle, actions }: Omit<PageHeaderProps, 'subtitleBelow'>) => (
  <div className="flex flex-col gap-2">
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 md:flex-nowrap">
      <h1 className="min-w-0 break-words text-xl font-semibold tracking-tight md:flex-1">{title}</h1>
      {actions && <div className="flex flex-wrap items-center gap-2 md:justify-end">{actions}</div>}
    </div>
    {subtitle && <p className="break-words text-muted-foreground">{subtitle}</p>}
  </div>
)
