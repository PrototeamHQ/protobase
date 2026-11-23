import { useQueries } from '@tanstack/react-query'
import type { AttachmentsModel } from '@protobase/schema'
import { useClient } from '../../data/api-provider'
import { keys } from '../../data/query-keys'
import { useAdminMeta } from '../meta-gate'
import { attachmentsByMessage, type Attachment } from './attachments'
import { ofMessagesFilter, readOfMessages } from './conversation-reads'

/**
 * The files of the messages shown, read with the reader's own access in one batch per page of messages, never one read
 * per message, and read again when the files' resource changes, as a sent or deleted message's do: `byMessage` holds
 * each message's files by its key, and `reading` is true while a page's first read is under way. Without attachments, nothing is read.
 */
export const useMessageAttachments = (attachments: AttachmentsModel | undefined, pages: readonly (readonly string[])[]) => {
  const client = useClient()
  const { resources } = useAdminMeta()
  const results = useQueries({
    queries: (attachments ? pages.filter((page) => page.length > 0) : []).map((page) => ({
      queryKey: keys.attachmentsOf(attachments!.resource, ofMessagesFilter(attachments!, page)),
      queryFn: () => readOfMessages(client, attachments!, page),
    })),
  })
  const model = attachments && resources[attachments.resource]
  const rows = results.flatMap((result) => result.data ?? [])
  return { byMessage: attachments && model ? attachmentsByMessage(rows, model, attachments) : new Map<string, Attachment[]>(), reading: results.some((result) => result.isPending), error: results.find((result) => result.error)?.error ?? undefined }
}
