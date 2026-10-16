import type { ResourceModel, ViewModel } from '@protobase/schema'
import { useRecord } from '../../data/use-record'
import { humanize } from '../../live/naming'
import { Skeleton } from '../../primitives/skeleton'
import { SpecTable } from '../../record-view'
import { ErrorBanner } from '../error-banner'
import { FieldValue } from '../pages/field-value'
import { fieldAccess } from '../permissions'
import { AppLink } from '../use-app-address'

// The fields a photo's record page shows in its sections, or without a layout every field but its key and tenant.
const detailFields = (model: ResourceModel, view: ViewModel | undefined) => {
  const sections = (view?.layout ?? []).flatMap((item) => (item.kind === 'section' ? item.fields : []))
  const names = sections.length > 0 ? [...new Set(sections)] : Object.keys(model.fields).filter((name) => name !== model.tenant && !model.primaryKey.includes(name))
  return names.filter((name) => model.fields[name] && !model.fields[name].sensitive)
}

/**
 * A photo's record, as the record API answers the user, so the server decides what they may read: the fields its
 * record page shows, as label/value rows, and a link to that page.
 */
export const PhotoDetails = ({ model, view, photoKey }: { model: ResourceModel; view: ViewModel | undefined; photoKey: string }) => {
  const record = useRecord(model.name, photoKey)
  const singular = (view?.names?.singular ?? humanize(model.name)).toLowerCase()
  if (record.isPending) return <Skeleton className="h-4 w-48" />
  if (record.error) return <ErrorBanner title={`Could not load the ${singular}`} error={record.error} />
  const shown = detailFields(model, view).filter((name) => fieldAccess(record.data.permissions, name) !== 'hidden')
  return (
    <>
      <SpecTable rows={shown.map((name) => ({ label: view?.fields[name]?.label ?? humanize(name), value: <FieldValue model={model} field={model.fields[name]!} value={record.data.record[name]} /> }))} />
      <AppLink to={{ kind: 'record', resource: model.name, key: photoKey }} className="mt-3 inline-block text-[13px] font-medium text-primary-text hover:underline">
        {`Open ${singular}`}
      </AppLink>
    </>
  )
}
