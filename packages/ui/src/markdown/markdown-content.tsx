import { useMemo } from 'react'
import DOMPurify from 'dompurify'
import { cn } from '../lib/cn'
import { markdownHtml } from './markdown-html'

// The parts markdown makes, in the theme's colours; code and tables wrap rather than scroll inside
const page = cn(
  'break-words [&>*:first-child]:mt-0 [&>*:last-child]:mb-0',
  '[&_p]:my-2 [&_ul]:my-2 [&_ol]:my-2 [&_pre]:my-2 [&_blockquote]:my-2 [&_table]:my-2 [&_hr]:my-3',
  '[&_h1]:mt-4 [&_h1]:mb-2 [&_h1]:text-lg [&_h1]:font-semibold [&_h2]:mt-4 [&_h2]:mb-2 [&_h2]:text-base [&_h2]:font-semibold',
  '[&_h3]:mt-3 [&_h3]:mb-1 [&_h3]:font-semibold [&_h4]:mt-3 [&_h4]:mb-1 [&_h4]:font-semibold [&_h5]:font-semibold [&_h6]:font-semibold',
  '[&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li:has(>input)]:list-none [&_li>input]:mr-1.5 [&_li>input]:-ml-5 [&_li>input]:align-middle',
  '[&_a]:text-primary-text [&_a]:underline [&_a]:underline-offset-2 hover:[&_a]:text-primary-hover',
  '[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.9em]',
  '[&_pre]:whitespace-pre-wrap [&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-3 [&_pre_code]:bg-transparent [&_pre_code]:p-0',
  '[&_blockquote]:border-l-2 [&_blockquote]:border-border-strong [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground',
  '[&_table]:w-full [&_table]:border-collapse [&_th]:border [&_th]:border-border [&_th]:bg-surface [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:font-semibold',
  '[&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1 [&_td]:[overflow-wrap:anywhere]',
  '[&_hr]:border-border [&_img]:inline [&_img]:max-w-full [&_img]:rounded [&_del]:text-muted-foreground',
)

// Inside a link, such as a card, it reads as running text: no gaps between blocks and headings no larger
const inLink = cn('[&_*]:my-0 [&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-semibold [&_ul]:list-inside [&_ol]:list-inside [&_pre]:whitespace-pre-wrap [&_code]:font-mono [&_code]:text-[0.9em]')

export type MarkdownContentProps = {
  source: string
  /** It is shown inside a link, such as a card: its own links and images show as their text. */
  inLink?: boolean
  className?: string
}

/** Markdown rendered, sanitised before it reaches the page: raw HTML shows as text, links open in a new tab. */
export const MarkdownContent = ({ source, inLink: insideLink = false, className }: MarkdownContentProps) => {
  const html = useMemo(() => DOMPurify.sanitize(markdownHtml(source, { inLink: insideLink }), { ADD_ATTR: ['target'] }), [source, insideLink])
  return <div className={cn(insideLink ? inLink : page, className)} dangerouslySetInnerHTML={{ __html: html }} />
}
