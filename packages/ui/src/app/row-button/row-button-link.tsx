import { ExternalLink } from 'lucide-react'
import type { ResourceModel, RowButtonModel, ViewModel } from '@protobase/schema'
import { cn } from '../../lib/cn'
import { buttonClass } from '../../primitives/button'
import { text } from '../messages'
import { AppLink } from '../use-app-address'
import { rowButtonFor } from './row-button-for'

type RowButtonLinkProps = { button: RowButtonModel; model: ResourceModel; view: ViewModel | undefined; record: Record<string, unknown> }

/**
 * A row's button: a link to the address its fields name, looking like a button, or to the outside page a field holds,
 * in a new tab with the outside-link mark, which a screen reader hears as text; nothing on a row without them.
 */
export const RowButtonLink = ({ button, model, view, record }: RowButtonLinkProps) => {
  const shown = rowButtonFor(button, model, view, record)
  if (!shown) return null
  // A label longer than its column has shortens inside the button, which stays whole
  const style = cn(buttonClass({ variant: 'secondary', size: 'sm' }), 'min-w-0 max-w-full shrink')
  const label = <span className="truncate" title={shown.label}>{shown.label}</span>
  if ('href' in shown) {
    return (
      <a href={shown.href} target="_blank" rel="noreferrer" className={style}>
        {label}
        <span className="sr-only"> {text('opensNewTab')}</span>
        <ExternalLink aria-hidden className="size-3.5 shrink-0" />
      </a>
    )
  }
  return (
    <AppLink to={shown.to} className={style}>
      {label}
    </AppLink>
  )
}
