import { useState } from 'react'
import type { AttachmentsModel } from '@protobase/schema'
import { Composer } from '../../chat'
import type { PeopleSearch } from '../../mentions'
import { useClient } from '../../data/api-provider'
import { acceptOf } from '../../live/file-values'
import { AttachmentPicker } from '../conversation-page/attachment-picker'
import { sendOps, sentMessage } from '../conversation-page/message-ops'
import { PendingAttachments } from '../conversation-page/pending-attachments'
import { useAttachmentUploads } from '../conversation-page/use-attachment-uploads'
import { recordKey } from '../../live/model-helpers'
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
  /** Finds the people `@` lists; without it, `@` is plain text. */
  searchPeople?: PeopleSearch
  /** The JSON field the ids of the people a message mentions go in. */
  mentions?: string
  /** The files a message carries, picked, pasted or dropped in the box and uploaded at once. */
  attachments?: AttachmentsModel
  /** Gets the box's text each time the person changes it, such as to tell others they type. */
  onDraft?: (text: string) => void
  /** Gets the key of each message sent, once the server took it. */
  onSent?: (key: string) => void
}

/**
 * A box that sends a message: each send creates a record of `resource` with the text in `field`, the ids of the people
 * it mentions in `mentions` and the `values`, for a user who may create one. With `attachments`, a button left of the box
 * picks files, and pasted and dropped ones join them: each uploads at once and shows above the box, the message waits
 * for their uploads and is written with them in one batch, and once one is uploaded it may go without text.
 */
export const MessageComposer = ({ resource, field, values, placeholder, searchPeople, mentions, attachments, onDraft, onSent }: MessageComposerProps) => {
  const { resources } = useAdminMeta()
  const client = useClient()
  const refresh = useRefreshResource()
  const permissions = usePermissions(resource)
  const [sending, setSending] = useState(false)
  const [failure, setFailure] = useState<unknown>()
  const files = useAttachmentUploads(attachments)
  if (!resources[resource] || !can(permissions, 'create')) return null

  const fileField = attachments && resources[attachments.resource]?.fields[attachments.file]
  const fileAccept = fileField && acceptOf(fileField)

  // The text stays in the box until the server took it, so a refused message can be sent again
  const send = async (message: string, mentioned: string[]) => {
    setSending(true)
    setFailure(undefined)
    const tickets = files.tickets
    // A message of files alone has no text
    const data = { ...values, ...(message !== '' && { [field]: message }), ...(mentions !== undefined && { [mentions]: mentioned }) }
    const write = attachments && tickets.length > 0 ? client.batchWrite(sendOps(resource, data, attachments, tickets)).then(sentMessage) : client.create(resource, data).then((created) => created.record)
    const model = resources[resource]!
    const sent = await write.then(
      (record) => {
        onSent?.(String(recordKey(model, record)))
        return true
      },
      (error: unknown) => {
        setFailure(error)
        return false
      },
    )
    setSending(false)
    if (!sent) return false
    void refresh(resource)
    if (attachments) files.sent(tickets)
    if (attachments && tickets.length > 0) void refresh(attachments.resource)
    return true
  }

  return (
    <div className="flex flex-col gap-2">
      {failure !== undefined && <ErrorBanner title={text('notSent')} error={failure} />}
      <Composer
        onSend={send}
        busy={sending || files.uploading}
        placeholder={placeholder}
        searchPeople={searchPeople}
        onDraft={onDraft}
        {...(attachments && {
          actions: <AttachmentPicker onPick={files.pick} accept={fileAccept} />,
          attachments: files.uploads.length > 0 && <PendingAttachments uploads={files.uploads} onRemove={files.remove} />,
          canSendEmpty: files.ready,
          onFiles: files.pick,
        })}
      />
    </div>
  )
}
