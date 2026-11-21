import { useMemo } from 'react'
import DOMPurify from 'dompurify'
import { cn } from '../lib/cn'
import { messageHtml } from './message-html'

// The parts a message's markdown makes, close together as in a chat with a line's gap between paragraphs, in the theme's colours; code wraps rather than scrolls
const message = cn(
  'break-words [&>*:first-child]:mt-0 [&>*:last-child]:mb-0',
  '[&_p]:my-2 [&_ul]:my-1 [&_ol]:my-1 [&_pre]:my-1 [&_blockquote]:my-1',
  '[&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li:has(>input)]:list-none [&_li>input]:mr-1.5 [&_li>input]:-ml-5 [&_li>input]:align-middle',
  '[&_a]:text-primary-text [&_a]:underline [&_a]:underline-offset-2 hover:[&_a]:text-primary-hover',
  '[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.9em]',
  '[&_pre]:whitespace-pre-wrap [&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-3 [&_pre_code]:bg-transparent [&_pre_code]:p-0',
  '[&_blockquote]:border-l-2 [&_blockquote]:border-border-strong [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground [&_del]:text-muted-foreground',
)

export type MessageContentProps = { text: string; mentions: readonly { name?: string }[] }

/** A message's text with its markdown and mentions rendered, sanitised before it reaches the page. */
export const MessageContent = ({ text, mentions }: MessageContentProps) => {
  const html = useMemo(() => DOMPurify.sanitize(messageHtml(text, mentions), { ADD_ATTR: ['target'] }), [text, mentions])
  return <div className={message} dangerouslySetInnerHTML={{ __html: html }} />
}
