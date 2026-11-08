import { useEffect, useState } from 'react'
import type { AppAddress } from '@protobase/schema'
import { humanize } from '../../live/naming'
import { Notice, useAdminMeta, usePermissions } from '../meta-gate'
import { can } from '../permissions'
import { useNavigationGuard } from '../router'
import { useAppAddress } from '../use-app-address'
import { CreateRecordForm } from './create-record-form'
import { useCreateForm } from './use-create-form'
import { text as appText } from '../messages'
import { text } from './messages'

type CreatePageProps = { resource: string; values?: Readonly<Record<string, string>> }

/** `/:resource/new`: a form from the view's layout, filled in with the address's `values`; on success it opens the new record. */
export const CreatePage = ({ resource, values }: CreatePageProps) => {
  const meta = useAdminMeta()
  const model = meta.resources[resource]
  const permissions = usePermissions(resource)
  if (!model) return <Notice title={appText('notFound')}>{appText('noResource', { name: resource })}</Notice>
  if (!can(permissions, 'create')) return <Notice title={text('notAllowed')}>{text('cannotCreate', { plural: meta.views[resource]?.names?.plural.toLowerCase() ?? resource })}</Notice>
  return <LoadedCreate resource={resource} values={values} />
}

const LoadedCreate = ({ resource, values }: CreatePageProps) => {
  const meta = useAdminMeta()
  const view = meta.views[resource]
  const { go } = useAppAddress()
  // The new record, once created: the page opens it once the guard below has let go
  const [newRecord, setNewRecord] = useState<AppAddress>()
  const form = useCreateForm({ resource, values, onCreated: (_, opens) => setNewRecord(opens) })
  // What is typed, or being created, is gone when the page is left
  useNavigationGuard(!newRecord && (form.touched || form.saving), 'input-lost')
  useEffect(() => {
    if (newRecord) go(newRecord, { replace: true })
  }, [newRecord, go])
  const noun = view?.names?.singular ?? humanize(resource)
  return (
    <CreateRecordForm
      ref={form.ref}
      noun={noun}
      collection={view?.names?.plural ?? humanize(resource)}
      sections={form.sections}
      width={view?.recordWidth}
      saving={form.saving}
      message={form.message}
      onSubmit={() => void form.submit()}
      onCancel={() => go({ kind: 'list', resource })}
    />
  )
}
