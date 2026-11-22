import type { AttachmentsModel, ResourceModel } from '@protobase/schema'
import { recordKey } from '../../live/model-helpers'
import { fileShown, isPreviewable } from '../../live/file-values'

type Row = Record<string, unknown>

/**
 * A file under a message, as its attachment record gives it: the record's key, which deletes it, the file's name, type
 * and size from the file field's value, the signed link the API answers with it, `undefined` while the file is missing
 * from storage, and an image's size in pixels where the record holds it.
 */
export type Attachment = { key: ReturnType<typeof recordKey>; name: string; type: string; size: number | undefined; url: string | undefined; width: number | undefined; height: number | undefined }

const pixels = (value: unknown) => (typeof value === 'number' ? value : undefined)

/** The attachment record `row` as an `Attachment`; `undefined` for one with no file. */
export const attachmentOf = (row: Row, model: ResourceModel, attachments: AttachmentsModel): Attachment | undefined => {
  const file = fileShown(row[attachments.file])
  if (!file) return
  const stored = 'missing' in file ? undefined : file
  return {
    key: recordKey(model, row),
    name: file.name,
    type: file.type,
    size: stored?.size,
    url: stored?.url,
    width: attachments.width === undefined ? undefined : pixels(row[attachments.width]),
    height: attachments.height === undefined ? undefined : pixels(row[attachments.height]),
  }
}

/** Attachment rows by the key of the message they are in, as text, each message's in the order the rows came. */
export const attachmentsByMessage = (rows: readonly Row[], model: ResourceModel, attachments: AttachmentsModel) => {
  const byMessage = new Map<string, Attachment[]>()
  for (const row of rows) {
    const attachment = attachmentOf(row, model, attachments)
    if (!attachment) continue
    const message = String(row[attachments.field])
    byMessage.set(message, [...(byMessage.get(message) ?? []), attachment])
  }
  return byMessage
}

/** Whether a file shows as an image under its message, rather than as a link that downloads it: a raster image with a link. */
export const isPreviewed = (attachment: Pick<Attachment, 'type' | 'url'>) => attachment.url !== undefined && isPreviewable(attachment.type)
