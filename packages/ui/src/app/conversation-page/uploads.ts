import { formatSize } from '../../live/file-values'
import { text } from './messages'

/**
 * A file picked for the next message: uploading while it has neither `ticket` nor `refusal`, `sent` bytes of it so
 * far; ready to send with its `ticket`; or refused, before its upload or by the server, with why.
 */
export type Upload = { key: number; name: string; size: number; sent: number; ticket?: string; refusal?: string }

/** Why a file is refused before it uploads, or `undefined` when it fits `maxSize`, the file field's limit in bytes. */
export const refusalOf = (file: { name: string; size: number }, maxSize: number | undefined) => {
  if (maxSize === undefined || file.size <= maxSize) return
  return text('fileTooLarge', { size: formatSize(file.size), max: formatSize(maxSize) })
}

/** The uploads `files` start, numbered from `firstKey`, each one larger than `maxSize` refused at once. */
export const uploadsOf = (files: readonly { name: string; size: number }[], firstKey: number, maxSize: number | undefined): Upload[] =>
  files.map((file, index) => ({ key: firstKey + index, name: file.name, size: file.size, sent: 0, refusal: refusalOf(file, maxSize) }))

/** Whether a file is still on its way. */
export const isUploading = (upload: Upload) => upload.ticket === undefined && upload.refusal === undefined

/** The tickets of the finished uploads, which the message's write sends as its files. */
export const ticketsOf = (uploads: readonly Upload[]) => uploads.flatMap((upload) => (upload.ticket === undefined ? [] : [upload.ticket]))

/** Whether the message may go without text: a file is uploaded and none is still on its way. */
export const hasFilesToSend = (uploads: readonly Upload[]) => !uploads.some(isUploading) && ticketsOf(uploads).length > 0

/** What a picked file says beside its name: why it was refused, how far its upload is, or its size once uploaded. */
export const uploadState = (upload: Upload) => {
  if (upload.refusal !== undefined) return upload.refusal
  if (upload.ticket !== undefined || upload.size === 0) return formatSize(upload.size)
  return text('uploadedPercent', { percent: Math.floor((Math.min(upload.sent, upload.size) / upload.size) * 100) })
}
