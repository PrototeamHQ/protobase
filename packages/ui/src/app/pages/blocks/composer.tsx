import { useState } from 'react'
import type { ComposerProps } from '@protobase/layout'
import { Composer } from '../../../chat'
import { useClient } from '../../../data/api-provider'
import { ErrorBanner } from '../../error-banner'
import { useAdminMeta, usePermissions } from '../../meta-gate'
import { can } from '../../permissions'
import { useRefreshResource } from '../use-layout-data'
import { propsOf, type BlockProps } from './block-props'
import { text } from '../messages'

/** A box that sends a message: each send creates a record of `resource` with the text in `field` and the `values`. */
export const ComposerBlock = ({ node }: BlockProps) => {
  const { resource, field, values, placeholder } = propsOf<ComposerProps>(node)
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
