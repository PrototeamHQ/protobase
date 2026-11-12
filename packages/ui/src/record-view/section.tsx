import type { ReactNode } from 'react'
import { HeadingLevel, useHeadingLevel } from '../lib/heading-level'

type Level = 2 | 3 | 4 | 5 | 6
type SectionProps = { title?: string; help?: string; actions?: ReactNode; count?: ReactNode; level?: Level; children: ReactNode }

const headingTags = { 2: 'h2', 3: 'h3', 4: 'h4', 5: 'h5', 6: 'h6' } as const

/** One below the heading the section sits under, such as h3 in a group; h2 at the top of a page. */
const useSectionLevel = () => Math.min(Math.max(useHeadingLevel(), 1) + 1, 6) as Level

/**
 * A section's title, `count` after it, its `actions` at the end of the title's line and its help, over its content,
 * with no frame or spacing around them. The title is an h`level`, by default one below the heading the section sits
 * under; headings in the content, such as a markdown value's, go below the title.
 */
export const SectionContent = ({ title, help, actions, count, level, children }: SectionProps) => {
  const inherited = useSectionLevel()
  const headingLevel = level ?? inherited
  const Heading = headingTags[headingLevel]
  const heading = title ? (
    <Heading className="flex items-center gap-2 text-base font-semibold text-foreground">
      {title}
      {count}
    </Heading>
  ) : null
  const headed = Boolean(heading || actions || help)
  const content = heading ? <HeadingLevel.Provider value={headingLevel}>{children}</HeadingLevel.Provider> : children
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
      {headed ? <div className="mt-5">{content}</div> : content}
    </>
  )
}

/** A titled part of the record page; `count` sits after the title, `actions` at the end of the title's line. */
export const Section = ({ title, help, actions, count, level, children }: SectionProps & { title: string }) => (
  <section className="py-8 first:pt-8">
    <SectionContent title={title} help={help} actions={actions} count={count} level={level}>
      {children}
    </SectionContent>
  </section>
)
