import type { RowButtonModel, ViewModel } from '@protobase/schema'
import { recordKey } from '../../live/model-helpers'
import { ActionButton } from '../pages/blocks/action'
import { RecordScope, type LayoutRecord } from '../pages/record-scope'
import { useRecordTitle } from '../titles/record-titles'
import { RowButtonLink } from '../row-button/row-button-link'
import { AppLink } from '../use-app-address'
import { RelatedField } from './related-field'
import { ToneEdge } from './tone-edge'

type CompactCardProps = {
  scope: LayoutRecord
  view: ViewModel | undefined
  /** The values on the second line, inline without labels. */
  fields: string[]
  /** The date or timestamp field beside the title. */
  time?: string
  /** The enum field whose value colours the card's left edge. */
  tone?: string
  actions: string[]
  button?: RowButtonModel
}

/**
 * A related record as a card of one or two lines: its title linking to its page and its `time` on the first, its
 * `fields` inline without labels, a dot between them, on the second, and its buttons beside both, or beside the second
 * where the card is narrow, as on a phone; its `tone` field colours its left edge.
 */
export const CompactCard = ({ scope, view, fields, time, tone, actions, button }: CompactCardProps) => {
  const titleOf = useRecordTitle()
  return (
    <li className="relative grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 rounded-lg border border-border bg-surface px-4 py-2.5">
      {tone && <ToneEdge view={view} field={tone} record={scope.record} />}
      <div className="col-span-2 flex min-w-0 items-baseline gap-2 sm:col-span-1">
        <AppLink to={{ kind: 'record', resource: scope.model.name, key: recordKey(scope.model, scope.record) }} className="line-clamp-2 min-w-0 font-medium [overflow-wrap:anywhere] text-primary-text hover:underline">
          {titleOf(scope.model, view, scope.record, scope.key)}
        </AppLink>
        {time && (
          <div className="ml-auto shrink-0 text-body whitespace-nowrap text-muted-foreground empty:hidden">
            <RelatedField scope={scope} path={time} labelled={false} />
          </div>
        )}
      </div>
      {fields.length > 0 && (
        <div className="flex min-w-0 flex-wrap items-center gap-y-0.5 text-body text-muted-foreground">
          {fields.map((path) => (
            <div key={path} className="flex max-w-full min-w-0 items-center whitespace-nowrap empty:hidden [&>div]:truncate [:not(:empty)~&]:before:mx-2 [:not(:empty)~&]:before:content-['·'_/_'']">
              <RelatedField scope={scope} path={path} labelled={false} />
            </div>
          ))}
        </div>
      )}
      {(actions.length > 0 || button) && (
        <RecordScope value={scope}>
          <div className="col-start-2 flex flex-wrap items-center justify-end gap-2 sm:row-span-2 sm:row-start-1">
            {button && <RowButtonLink button={button} model={scope.model} view={view} record={scope.record} />}
            {actions.map((name) => <ActionButton key={name} name={name} />)}
          </div>
        </RecordScope>
      )}
    </li>
  )
}
