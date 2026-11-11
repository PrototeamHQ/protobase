import type { RowButtonModel, ViewModel } from '@protobase/schema'
import { recordKey } from '../../live/model-helpers'
import { ActionButton } from '../pages/blocks/action'
import { RecordScope, type LayoutRecord } from '../pages/record-scope'
import { useRecordTitle } from '../titles/record-titles'
import { RowButtonLink } from '../row-button/row-button-link'
import { AppLink } from '../use-app-address'
import { RelatedField } from './related-field'
import { ToneEdge } from './tone-edge'

/**
 * A related record as a card: its title linking to its page, its `fields` under their labels, the buttons of its
 * view's `actions`, run on it as everywhere else, and `button`, a link to the address its fields name; its `tone`
 * field colours its left edge.
 */
export const RelatedCard = ({ scope, view, fields, tone, actions, button }: { scope: LayoutRecord; view: ViewModel | undefined; fields: string[]; tone?: string; actions: string[]; button?: RowButtonModel }) => {
  const titleOf = useRecordTitle()
  return (
    <li className="relative flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-surface p-4">
      {tone && <ToneEdge view={view} field={tone} record={scope.record} />}
      <AppLink to={{ kind: 'record', resource: scope.model.name, key: recordKey(scope.model, scope.record) }} className="self-start font-medium text-primary-text hover:underline">
        {titleOf(scope.model, view, scope.record, scope.key)}
      </AppLink>
      {fields.length > 0 && (
        <dl className="flex flex-col gap-3">
          {fields.map((path) => <RelatedField key={path} scope={scope} path={path} clamped />)}
        </dl>
      )}
      {(actions.length > 0 || button) && (
        <RecordScope value={scope}>
          <div className="flex flex-wrap items-center gap-2">
            {button && <RowButtonLink button={button} model={scope.model} view={view} record={scope.record} />}
            {actions.map((name) => <ActionButton key={name} name={name} />)}
          </div>
        </RecordScope>
      )}
    </li>
  )
}
