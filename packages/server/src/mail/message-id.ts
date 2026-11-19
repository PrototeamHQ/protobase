import { randomUUID } from 'node:crypto'

/**
 * A new `Message-ID` for mail from `from`, as RFC 5322 writes one: `<random@domain>`, random per call and on the From
 * address's domain, so it is unique to this message and known before the message is sent.
 */
export const messageId = (from: string) => `<${randomUUID().replaceAll('-', '')}@${from.slice(from.lastIndexOf('@') + 1)}>`
