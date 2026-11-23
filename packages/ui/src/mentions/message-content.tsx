import { useMemo } from 'react'
import DOMPurify from 'dompurify'
import { messageClass } from './message-class'
import { messageHtml } from './message-html'

export type MessageContentProps = { text: string; mentions: readonly { name?: string }[] }

/** A message's text with its markdown and mentions rendered, sanitised before it reaches the page. */
export const MessageContent = ({ text, mentions }: MessageContentProps) => {
  const html = useMemo(() => DOMPurify.sanitize(messageHtml(text, mentions), { ADD_ATTR: ['target'] }), [text, mentions])
  return <div className={messageClass} dangerouslySetInnerHTML={{ __html: html }} />
}
