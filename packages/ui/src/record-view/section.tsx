import type { ReactNode } from 'react'
import { HeadingLevel } from '../lib/heading-level'

type SectionProps = { title?: string; help?: string; actions?: ReactNode; count?: ReactNode; children: ReactNode }

/**
 * A section's title, `count` after it, its `actions` at the end of the title's line and its help, over its content,
 * with no frame or spacing around them. Headings in the content, such as a markdown value's, go below the title's h2.
 */
export const SectionContent = ({ title, help, actions, count, children }: SectionProps) => {
  const heading = title ? (
    <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
      {title}
      {count}
    </h2>
  ) : null
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
      <HeadingLevel.Provider value={heading ? 2 : 0}>{headed ? <div className="mt-5">{children}</div> : children}</HeadingLevel.Provider>
    </>
  )
}

/** A titled part of the record page; `count` sits after the title, `actions` at the end of the title's line. */
export const Section = ({ title, help, actions, count, children }: SectionProps & { title: string }) => (
  <section className="py-8 first:pt-8">
    <SectionContent title={title} help={help} actions={actions} count={count}>
      {children}
    </SectionContent>
  </section>
)
