import type { ReactNode } from 'react'

export const PageHeader = ({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) => (
  <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
    <div>
      <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
      {subtitle && <p className="text-[13px] text-muted-foreground">{subtitle}</p>}
    </div>
    <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">{actions}</div>
  </div>
)
