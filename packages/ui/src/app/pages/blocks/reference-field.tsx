import type { ReactNode } from 'react'
import { scopeValue, type ReferenceFieldProps } from '@protobase/layout'
import type { ResourceModel } from '@protobase/schema'
import { recordTitle } from '@protobase/schema/internal'
import { Skeleton } from '../../../primitives/skeleton'
import { ErrorBanner } from '../../error-banner'
import { useAdminMeta } from '../../meta-gate'
import { AppLink } from '../../use-app-address'
import { LayoutListScope } from '../layout-list'
import { RecordScope, useScopeStack, valueScopeOf } from '../record-scope'
import { useFirstRecord } from '../use-layout-data'
import { propsOf, type BlockProps } from './block-props'
import { text } from '../messages'

type LoadedProps = { model: ResourceModel; recordKey: string; link: ReferenceFieldProps['link']; children: ReactNode[]; className?: string }

// The record its key names, its children inside it or its title, linked to its page unless `link` is false
const LoadedReference = ({ model, recordKey, link = 'edit', children, className }: LoadedProps) => {
  const { views } = useAdminMeta()
  const record = useFirstRecord(model, { key: recordKey })
  if (record.isPending) return <Skeleton className="h-4 w-24" />
  if (record.error) return <ErrorBanner title={text('couldNotLoad')} error={record.error} />
  if (!record.data) return null
  const shown = children.length > 0 ? (
      <RecordScope value={record.data}>
        <LayoutListScope value={undefined}>{children}</LayoutListScope>
      </RecordScope>
    ) : recordTitle(model, views[model.name], record.data.record, recordKey)
  if (link === false) return <span className={className}>{shown}</span>
  return (
    <AppLink to={{ kind: 'record', resource: model.name, key: recordKey }} className={className ?? 'font-medium text-primary-text hover:underline'}>
      {shown}
    </AppLink>
  )
}

/**
 * The record of `reference` the record's `source` points at, as react-admin's ReferenceField: its children inside that
 * record, or its title, as a link to the record's page; `empty` when the field holds none.
 */
export const ReferenceFieldBlock = ({ node, children, className }: BlockProps) => {
  const { reference, source, link, empty } = propsOf<ReferenceFieldProps>(node)
  const model = useAdminMeta().resources[reference]
  const value = scopeValue(valueScopeOf(useScopeStack()), source)
  if (!model) return null
  if (value === null || value === undefined || value === '') return empty === undefined ? null : <span className={className}>{empty}</span>
  return (
    <LoadedReference model={model} recordKey={String(value)} link={link} className={className}>
      {children}
    </LoadedReference>
  )
}
