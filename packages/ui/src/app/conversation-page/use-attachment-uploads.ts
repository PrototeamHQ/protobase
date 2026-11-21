import { useEffect, useRef, useState } from 'react'
import type { AttachmentsModel } from '@protobase/schema'
import { useClient } from '../../data/api-provider'
import { refusalReason } from '../displays/board-columns'
import { useAdminMeta } from '../meta-gate'
import { hasFilesToSend, isUploading, ticketsOf, uploadsOf, type Upload } from './uploads'
import { text } from './messages'

/**
 * The files picked for the next message, each uploaded through the client's upload to the attachments' file field as
 * soon as it is picked, so sending waits only for those still on their way. One larger than the field's limit is
 * refused before it uploads; the server's own refusal shows on its file. `pick` adds files, `remove` takes one off and
 * stops its upload, and `sent` takes off the files a message carried, with those refused. Without attachments, it
 * holds nothing.
 */
export const useAttachmentUploads = (attachments: AttachmentsModel | undefined) => {
  const client = useClient()
  const { resources } = useAdminMeta()
  const maxSize = attachments && resources[attachments.resource]?.fields[attachments.file]?.file?.maxSize
  const [uploads, setUploads] = useState<Upload[]>([])
  const nextKey = useRef(0)
  const stops = useRef(new Map<number, AbortController>())

  const change = (key: number, patch: Partial<Upload>) => setUploads((current) => current.map((upload) => (upload.key === key ? { ...upload, ...patch } : upload)))

  const start = (attached: AttachmentsModel, upload: Upload, file: File) => {
    const stop = new AbortController()
    stops.current.set(upload.key, stop)
    client
      .upload(attached.resource, attached.file, file, { signal: stop.signal, onProgress: (sent) => change(upload.key, { sent }) })
      .then(
        (result) => change(upload.key, { ticket: result.value }),
        (error: unknown) => {
          // Taken off by the reader, who no longer waits on it
          if (stop.signal.aborted) return
          change(upload.key, { refusal: text('fileNotUploaded', { reason: refusalReason(error) }) })
        },
      )
      .finally(() => stops.current.delete(upload.key))
  }

  const pick = (files: readonly File[]) => {
    if (!attachments || files.length === 0) return
    const added = uploadsOf(files, nextKey.current, maxSize)
    nextKey.current += files.length
    setUploads((current) => [...current, ...added])
    added.forEach((upload, index) => {
      if (upload.refusal === undefined) start(attachments, upload, files[index]!)
    })
  }

  const remove = (key: number) => {
    stops.current.get(key)?.abort()
    setUploads((current) => current.filter((upload) => upload.key !== key))
  }

  // Files picked while the message was on its way stay for the next one
  const sent = (tickets: readonly string[]) => setUploads((current) => current.filter((upload) => isUploading(upload) || (upload.ticket !== undefined && !tickets.includes(upload.ticket))))

  // Uploads still on their way when the box goes are stopped
  useEffect(() => {
    const running = stops.current
    return () => running.forEach((stop) => stop.abort())
  }, [])

  return { uploads, tickets: ticketsOf(uploads), uploading: uploads.some(isUploading), ready: hasFilesToSend(uploads), pick, remove, sent }
}
