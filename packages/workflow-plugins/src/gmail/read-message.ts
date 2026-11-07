import { fetchMaxBytes, ResponseTooLargeError } from '@protobase/workflows/plugin'
import { GmailNotFound, type GmailApi } from './api'
import { messageHeaders, rawMessage, type MessageRef } from './calls'
import { headersItem, parsedItem } from './mail-item'

// Undefined for a message deleted since it was listed.
const unlessDeleted = <T>(read: Promise<T>) =>
  read.catch((error: unknown) => {
    if (error instanceof GmailNotFound) return
    throw error
  })

const rawOrTooLarge = (api: GmailApi, id: string) =>
  rawMessage(api, id, fetchMaxBytes).catch((error: unknown) => {
    if (error instanceof ResponseTooLargeError) return 'too large' as const
    throw error
  })

/**
 * One message as a run's input: read whole, at most 10 MiB of answer, which holds the mail in base64 and so about
 * 7.5 MiB of mail, else from its headers alone when it is larger or too complex to parse; `undefined` when it was
 * deleted since it was listed.
 */
export const readMessage = async (api: GmailApi, ref: MessageRef) => {
  const raw = await unlessDeleted(rawOrTooLarge(api, ref.id))
  if (raw === undefined) return
  const parsed = raw === 'too large' ? undefined : await parsedItem(ref, raw)
  if (parsed) return parsed
  const headers = await unlessDeleted(messageHeaders(api, ref.id))
  return headers && headersItem(ref, headers)
}
