import type { ReactNode } from 'react'

export const FilterSection = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="flex flex-col gap-2 border-b py-3 last:border-b-0">
    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
    {children}
  </section>
)
