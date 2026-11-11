import type { ResourceModel, RowButtonModel, ViewModel } from '@protobase/schema'
import { buttonClass } from '../../primitives/button'
import { AppLink } from '../use-app-address'
import { rowButtonFor } from './row-button-for'

type RowButtonLinkProps = { button: RowButtonModel; model: ResourceModel; view: ViewModel | undefined; record: Record<string, unknown> }

/** A row's button: a link to the address its fields name, looking like a button; nothing on a row without them. */
export const RowButtonLink = ({ button, model, view, record }: RowButtonLinkProps) => {
  const shown = rowButtonFor(button, model, view, record)
  if (!shown) return null
  return (
    <AppLink to={shown.to} className={buttonClass({ variant: 'secondary', size: 'sm' })}>
      {shown.label}
    </AppLink>
  )
}
