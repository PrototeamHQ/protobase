import type { ReactNode } from 'react'

export type PageHeaderProps = {
  title: string
  subtitle?: string
  /** A control kept at the right of the title on every screen, where the actions wrap below it on a phone. */
  aside?: ReactNode
  actions?: ReactNode
}

export const PageHeader = ({ title, subtitle, aside, actions }: PageHeaderProps) => {
  const heading = (
    <div>
      <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
      {subtitle && <p className="text-muted-foreground">{subtitle}</p>}
    </div>
  )
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
      {aside ? (
        <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
          {heading}
          {aside}
        </div>
      ) : (
        heading
      )}
      {actions && <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">{actions}</div>}
    </div>
  )
}
