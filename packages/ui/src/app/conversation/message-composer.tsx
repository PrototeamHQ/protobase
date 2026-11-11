import { useState } from 'react'
import { Composer } from '../../chat'
import { useClient } from '../../data/api-provider'
import { ErrorBanner } from '../error-banner'
import { useAdminMeta, usePermissions } from '../meta-gate'
import { can } from '../permissions'
import { useRefreshResource } from '../pages/use-layout-data'
import { text } from './messages'

export type MessageComposerProps = {
  resource: string
  /** The text field the message goes in. */
  field: string
  /** Values sent with every message, such as the record's key in its relation. */
  values?: Record<string, unknown>
  placeholder?: string
}

/** A box that sends a message: each send creates a record of `resource` with the text in `field` and the `values`, for a user who may create one. */
export const MessageComposer = ({ resource, field, values, placeholder }: MessageComposerProps) => {
  const { resources } = useAdminMeta()
  const client = useClient()
  const refresh = useRefreshResource()
  const permissions = usePermissions(resource)
  const [sending, setSending] = useState(false)
  const [failure, setFailure] = useState<unknown>()
  if (!resources[resource] || !can(permissions, 'create')) return null

  // The text stays in the box until the server took it, so a refused message can be sent again
  const send = async (message: string) => {
    setSending(true)
    setFailure(undefined)
    const sent = await client.create(resource, { ...values, [field]: message }).then(
      () => true,
      (error: unknown) => {
        setFailure(error)
        return false
      },
    )
    setSending(false)
    if (sent) void refresh(resource)
    return sent
  }

  return (
    <div className="flex flex-col gap-2">
      {failure !== undefined && <ErrorBanner title={text('notSent')} error={failure} />}
      <Composer onSend={send} busy={sending} placeholder={placeholder} />
    </div>
  )
}
