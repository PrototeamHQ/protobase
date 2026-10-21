import type { ReactNode } from 'react'

type SectionProps = { title?: string; help?: string; actions?: ReactNode; children: ReactNode }

/** A section's title, its `actions` at the end of the title's line and its help, over its content, with no frame or spacing around them. */
export const SectionContent = ({ title, help, actions, children }: SectionProps) => {
  const heading = title ? <h2 className="text-[16px] font-semibold text-foreground">{title}</h2> : null
  const headed = Boolean(heading || actions || help)
  return (
    <>
      {actions ? (
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          {heading ?? <span />}
          {actions}
        </div>
      ) : (
        heading
      )}
      {help && <p className="mt-1 max-w-xl leading-6 text-muted-foreground">{help}</p>}
      {headed ? <div className="mt-5">{children}</div> : children}
    </>
  )
}

/** A titled part of the record page; `actions` sit at the end of the title's line. */
export const Section = ({ title, help, actions, children }: SectionProps & { title: string }) => (
  <section className="py-8 first:pt-8">
    <SectionContent title={title} help={help} actions={actions}>
      {children}
    </SectionContent>
  </section>
)
