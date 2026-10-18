import type { MouseEvent } from 'react'
import { cn } from '../lib/cn'
import { contactHref, type ContactFormat } from './contact-links'

type ContactLinkProps = { format: ContactFormat; value: string; className?: string }

// A link inside a clickable row or card opens the address only, not the record
const stayInRow = (event: MouseEvent) => event.stopPropagation()

/** A value that is an address as a link that writes to, calls or opens it, a web page in a new tab; else its text. */
export const ContactLink = ({ format, value, className }: ContactLinkProps) => {
  const href = contactHref(format, value)
  if (!href) return <span className={className}>{value}</span>
  const away = format === 'url' ? { target: '_blank', rel: 'noreferrer' } : {}
  return (
    <a href={href} {...away} onClick={stayInRow} className={cn('font-medium text-primary-text hover:underline', className)}>
      {value}
    </a>
  )
}
