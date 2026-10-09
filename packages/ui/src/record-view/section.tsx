import type { ReactNode } from 'react'

export const Section = ({ title, help, children }: { title: string; help?: string; children: ReactNode }) => (
  <section className="py-8 first:pt-8">
    <h2 className="text-[15px] font-semibold text-foreground">{title}</h2>
    {help && <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-muted-foreground">{help}</p>}
    <div className="mt-5">{children}</div>
  </section>
)
