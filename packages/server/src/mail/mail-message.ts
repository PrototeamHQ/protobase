export type MailMessage = {
  to: string
  subject: string
  /** The plain-text body, which clients that show no HTML show instead. */
  text: string
  /** The HTML body, sent beside `text` as the alternative clients show when they can. */
  html?: string
  /**
   * More header fields by name, such as `List-Unsubscribe` and `List-Unsubscribe-Post`, which mailbox providers expect
   * of bulk mail. A value is one line.
   */
  headers?: Record<string, string>
  /** Files sent with the message, such as an invoice's PDF. */
  attachments?: MailAttachment[]
  /**
   * Marks bulk mail, such as a newsletter or a digest: mail the recipient did not ask for by an action of their own.
   * A job's `mail` gives it a one-click unsubscribe for its `topic`, and skips a recipient who unsubscribed from it.
   */
  bulk?: boolean
  /** The kind of mail, such as `newsletter`, which a recipient unsubscribes from; required with `bulk`. */
  topic?: string
}

/** A file sent with a message: its name as the recipient sees it, its bytes, and its media type, else one its name implies. */
export type MailAttachment = { filename: string; content: Uint8Array; contentType?: string }

/**
 * A message sent: its `Message-ID` as the recipient sees it, angle brackets and all, to match a later reply, bounce or
 * complaint to it; absent when the transport cannot tell which id the recipient gets, as for a linked Gmail mailbox, or the message was not sent to anyone (`skipped`).
 */
export type SentMail = {
  messageId?: string
  /** Of bulk mail: the recipients who unsubscribed from its topic, to whom it was not sent; `[]` when it was sent. */
  skipped?: string[]
}

/** Sends one message; rejects when the server refuses it. */
export type Mailer = { send: (message: MailMessage) => Promise<SentMail> }
