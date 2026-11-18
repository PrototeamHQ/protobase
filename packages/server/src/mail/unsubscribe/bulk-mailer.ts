import type { Db } from '@protobase/query'
import type { Mailer, MailMessage } from '../mail-message'
import { bulkRecipients, checkBulkOptions } from './bulk-options'
import { unsubscribeHeaders } from './unsubscribe-headers'
import type { UnsubscribeLinks } from './unsubscribe-links'
import { unsubscribedOf } from './unsubscribe-store'

// The message's own header fields but those the unsubscribe sets, whatever their case, so it carries one of each.
const withHeaders = (own: Record<string, string> | undefined, added: Record<string, string>) => {
  const names = new Set(Object.keys(added).map((name) => name.toLowerCase()))
  return { ...Object.fromEntries(Object.entries(own ?? {}).filter(([name]) => !names.has(name.toLowerCase()))), ...added }
}

/** What bulk mail needs: the links it carries, and which recipients unsubscribed from a topic. */
export type BulkMail = { links: UnsubscribeLinks; unsubscribed: (topic: string, recipients: readonly string[]) => Promise<string[]> }

/**
 * `mailer` with the app's unsubscribe: a bulk message (`bulk: true`, with a `topic`) goes to each of its recipients
 * as a message of its own, with that recipient's one-click unsubscribe link (`unsubscribeHeaders`) in place of such
 * headers of its own, except to whoever unsubscribed from its topic, found in one query. It resolves to `skipped`, the
 * recipients not sent to, `sent`, each recipient sent to with its message id, and `messageId` when it went to exactly
 * one. Without `bulk`, when `unsubscribe` is off, bulk mail is refused. Transactional mail goes through unchanged, its
 * topic dropped.
 *
 * The opt-outs are read once, before the first message, as the one query; one recorded while the messages go out
 * counts from the next send. A message the server refuses rejects the send, after those already sent, so a job try
 * that is retried sends them again, as any send in a retried try does.
 */
export const bulkMailer = (mailer: Mailer, bulk: BulkMail | undefined): Mailer => ({
  send: async ({ bulk: isBulk, topic, ...message }: MailMessage) => {
    if (!isBulk) return mailer.send(message)
    checkBulkOptions('A message', { bulk: isBulk, ...(topic !== undefined && { topic }) })
    if (!bulk) throw new Error('Bulk mail needs its one-click unsubscribe: turn it on with unsubscribe: true in protobase.config.ts')
    const recipients = bulkRecipients(message.to)
    const skipped = await bulk.unsubscribed(topic!, recipients)
    const sent = []
    for (const recipient of recipients.filter((address) => !skipped.includes(address))) {
      const headers = withHeaders(message.headers, unsubscribeHeaders(bulk.links.url({ recipient, topic: topic! })))
      const { messageId } = await mailer.send({ ...message, to: recipient, headers })
      sent.push({ to: recipient, ...(messageId !== undefined && { messageId }) })
    }
    const only = sent.length === 1 ? sent[0]!.messageId : undefined
    return { ...(only !== undefined && { messageId: only }), skipped, sent }
  },
})

/** `bulkMailer` over the app's database: the opt-outs are read from its `mail.unsubscribes` when `links` are given. */
export const appBulkMailer = (mailer: Mailer, db: Db, links: UnsubscribeLinks | undefined) =>
  bulkMailer(mailer, links && { links, unsubscribed: (topic, recipients) => unsubscribedOf(db, topic, recipients) })
