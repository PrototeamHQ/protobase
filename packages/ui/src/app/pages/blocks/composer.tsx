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
  const [failure, setFailure] = useState<{ error: unknown; message: string }>()
  if (!resources[resource] || !can(permissions, 'create')) return null

  const send = async (message: string) => {
    setSending(true)
    setFailure(undefined)
    await client.create(resource, { ...values, [field]: message }).then(
      () => refresh(resource),
      (error: unknown) => setFailure({ error, message }),
    )
    setSending(false)
  }

  return (
    <div className="flex flex-col gap-2">
      {failure && (
        <div className="flex flex-col gap-1">
          <ErrorBanner title={text('notSent')} error={failure.error} />
          <p className="whitespace-pre-wrap break-words text-muted-foreground">{failure.message}</p>
        </div>
      )}
      <Composer onSend={(message) => void send(message)} busy={sending} placeholder={placeholder} />
    </div>
  )
}
