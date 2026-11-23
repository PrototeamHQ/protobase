import { cn } from '../lib/cn'

/**
 * The box of a message's text, the same while the markdown renderer loads and once it has: its parts close together as
 * in a chat, a line's gap between paragraphs and no margin outside the first and last, in the theme's colours; code
 * wraps rather than scrolls, and inline code leaves its line as tall as the text's. The whitespace between the rendered
 * blocks takes no room, even inside a box that keeps whitespace, and a paragraph keeps the spaces as typed.
 */
export const messageClass = cn(
  'whitespace-normal break-words [&>*:first-child]:mt-0 [&>*:last-child]:mb-0',
  '[&_p]:my-2 [&_p]:whitespace-pre-wrap [&_ul]:my-1 [&_ol]:my-1 [&_pre]:my-1 [&_blockquote]:my-1',
  '[&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li:has(>input)]:list-none [&_li>input]:mr-1.5 [&_li>input]:-ml-5 [&_li>input]:align-middle',
  '[&_a]:text-primary-text [&_a]:underline [&_a]:underline-offset-2 hover:[&_a]:text-primary-hover',
  '[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.9em] [&_code]:leading-none',
  '[&_pre]:whitespace-pre-wrap [&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-3 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:leading-[inherit]',
  '[&_blockquote]:border-l-2 [&_blockquote]:border-border-strong [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground [&_del]:text-muted-foreground',
)
