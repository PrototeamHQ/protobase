import type { ReactNode } from 'react'

/** A titled part of the record page; `actions` sit at the end of the title's line. */
export const Section = ({ title, help, actions, children }: { title: string; help?: string; actions?: ReactNode; children: ReactNode }) => {
  const heading = <h2 className="text-[15px] font-semibold text-foreground">{title}</h2>
  return (
    <section className="py-8 first:pt-8">
      {actions ? (
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          {heading}
          {actions}
        </div>
      ) : (
        heading
      )}
      {help && <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-muted-foreground">{help}</p>}
      <div className="mt-5">{children}</div>
    </section>
  )
}
