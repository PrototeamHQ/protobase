import type { ResourceModel, ViewModel } from '@protobase/schema'
import { useRecord } from '../../data/use-record'
import { humanize } from '../../live/naming'
import { Skeleton } from '../../primitives/skeleton'
import { SpecTable } from '../../record-view'
import { ErrorBanner } from '../error-banner'
import { FieldValue } from '../pages/field-value'
import { fieldAccess } from '../permissions'
import { AppLink } from '../use-app-address'
import { text } from './messages'

/**
 * A photo's record, as the record API answers the user, so the server decides what they may read: its `fields` (see
 * `detailFields`), as label/value rows, and a link to its page.
 */
export const PhotoDetails = ({ model, view, photoKey, fields }: { model: ResourceModel; view: ViewModel | undefined; photoKey: string; fields: readonly string[] }) => {
  const record = useRecord(model.name, photoKey)
  const singular = (view?.names?.singular ?? humanize(model.name)).toLowerCase()
  if (record.isPending) return <Skeleton className="h-4 w-48" />
  if (record.error) return <ErrorBanner title={text('couldNotLoadOne', singular)} error={record.error} />
  const shown = fields.filter((name) => fieldAccess(record.data.permissions, name) !== 'hidden')
  return (
    <>
      <SpecTable rows={shown.map((name) => ({ label: view?.fields[name]?.label ?? humanize(name), value: <FieldValue model={model} field={model.fields[name]!} value={record.data.record[name]} /> }))} />
      <AppLink to={{ kind: 'record', resource: model.name, key: photoKey }} className="mt-3 inline-block font-medium text-primary-text hover:underline">
        {text('open', singular)}
      </AppLink>
    </>
  )
}
