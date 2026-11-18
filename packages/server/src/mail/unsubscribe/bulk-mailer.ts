import type { Db } from '@protobase/query'
import type { Mailer, MailMessage } from '../mail-message'
import { bulkRecipient, checkBulkOptions } from './bulk-options'
import { unsubscribeHeaders } from './unsubscribe-headers'
import type { UnsubscribeLinks } from './unsubscribe-links'
import { unsubscribedOf } from './unsubscribe-store'

/** What bulk mail needs: the links it carries, and which recipients unsubscribed from a topic. */
export type BulkMail = { links: UnsubscribeLinks; unsubscribed: (topic: string, recipients: readonly string[]) => Promise<string[]> }

/**
 * `mailer` with the app's unsubscribe: a bulk message (`bulk: true`, with a `topic`) to someone who unsubscribed from
 * its topic is not sent, and the send resolves to `{ skipped: [address] }`; any other gets the recipient's own
 * one-click unsubscribe link (`unsubscribeHeaders`), in place of such headers of its own, and resolves to what
 * `mailer` gives with `skipped: []`. Without `bulk`, when `unsubscribe` is off, bulk mail is refused. Transactional
 * mail goes through unchanged, its topic dropped.
 */
export const bulkMailer = (mailer: Mailer, bulk: BulkMail | undefined): Mailer => ({
  send: async ({ bulk: isBulk, topic, ...message }: MailMessage) => {
    if (!isBulk) return mailer.send(message)
    checkBulkOptions('A message', { bulk: isBulk, ...(topic !== undefined && { topic }) })
    if (!bulk) throw new Error('Bulk mail needs its one-click unsubscribe: turn it on with unsubscribe: true in protobase.config.ts')
    const recipient = bulkRecipient(message.to)
    const skipped = await bulk.unsubscribed(topic!, [recipient])
    if (skipped.length > 0) return { skipped }
    const headers = { ...message.headers, ...unsubscribeHeaders(bulk.links.url({ recipient, topic: topic! })) }
    return { ...(await mailer.send({ ...message, headers })), skipped: [] }
  },
})

/** `bulkMailer` over the app's database: the opt-outs are read from its `mail.unsubscribes` when `links` are given. */
export const appBulkMailer = (mailer: Mailer, db: Db, links: UnsubscribeLinks | undefined) =>
  bulkMailer(mailer, links && { links, unsubscribed: (topic, recipients) => unsubscribedOf(db, topic, recipients) })
