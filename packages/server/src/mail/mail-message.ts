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
}

/** A file sent with a message: its name as the recipient sees it, its bytes, and its media type, else one its name implies. */
export type MailAttachment = { filename: string; content: Uint8Array; contentType?: string }

/** Sends one message; rejects when the server refuses it. */
export type Mailer = { send: (message: MailMessage) => Promise<void> }
