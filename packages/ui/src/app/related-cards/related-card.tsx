import type { ViewModel } from '@protobase/schema'
import { recordKey, recordTitle } from '../../live/model-helpers'
import { Skeleton } from '../../primitives/skeleton'
import { useAdminMeta } from '../meta-gate'
import { ActionButton } from '../pages/blocks/action'
import { fieldLabel } from '../pages/blocks/field'
import { FieldValue } from '../pages/field-value'
import { RecordScope, type LayoutRecord } from '../pages/record-scope'
import { usePathValue } from '../pages/use-path-value'
import { AppLink } from '../use-app-address'
import { Clamped } from './clamped'

// A field of the card's record, through relations too, under its label; a long value shows its first lines
const CardField = ({ scope, path }: { scope: LayoutRecord; path: string }) => {
  const { views } = useAdminMeta()
  const value = usePathValue(scope, path)
  if (value.state === 'missing') return null
  const label = fieldLabel(path, value.state === 'ready' ? views[value.model.name]?.fields[value.field.name]?.label : undefined)
  return (
    <div className="min-w-0">
      <dt className="text-body text-muted-foreground">{label}</dt>
      <dd className="mt-0.5">{value.state === 'loading' ? <Skeleton className="h-4 w-24" /> : <Clamped><FieldValue model={value.model} field={value.field} value={value.value} /></Clamped>}</dd>
    </div>
  )
}

/**
 * A related record as a card: its title linking to its page, its `fields` under their labels and the buttons of its
 * view's `actions`, run on it as everywhere else.
 */
export const RelatedCard = ({ scope, view, fields, actions }: { scope: LayoutRecord; view: ViewModel | undefined; fields: string[]; actions: string[] }) => (
  <li className="flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-surface p-4">
    <AppLink to={{ kind: 'record', resource: scope.model.name, key: recordKey(scope.model, scope.record) }} className="self-start font-medium text-primary-text hover:underline">
      {recordTitle(scope.model, view, scope.record, scope.key)}
    </AppLink>
    {fields.length > 0 && (
      <dl className="flex flex-col gap-3">
        {fields.map((path) => <CardField key={path} scope={scope} path={path} />)}
      </dl>
    )}
    {actions.length > 0 && (
      <RecordScope value={scope}>
        <div className="flex flex-wrap items-center gap-2">
          {actions.map((name) => <ActionButton key={name} name={name} />)}
        </div>
      </RecordScope>
    )}
  </li>
)
