// Mails written by hand in the RFC 5322 and MIME formats, for the fake Gmail; none comes from a real mailbox.

export type MailParts = {
  from?: string
  to?: string
  cc?: string
  subject?: string
  date?: string
  text?: string
  html?: string
  attachments?: { filename: string; type?: string; content: string }[]
  /** Header lines as given, before the generated ones. */
  headers?: string[]
}

const boundary = 'fake-gmail-boundary'

/** A mail's raw source: a multipart/mixed message of its text, its HTML and its attachments. */
export const mail = ({ from = 'Ada <ada@example.com>', to = 'Grace <grace@example.com>', cc, subject = 'Hello', date = 'Thu, 05 Nov 2026 10:00:00 +0000', text = 'Hi there', html, attachments = [], headers = [] }: MailParts = {}) => {
  const head = [...headers, ...(from ? [`From: ${from}`] : []), `To: ${to}`, ...(cc ? [`Cc: ${cc}`] : []), `Subject: ${subject}`, `Date: ${date}`, 'Message-ID: <hand-written@example.com>', 'MIME-Version: 1.0', `Content-Type: multipart/mixed; boundary="${boundary}"`]
  const plain = ['Content-Type: text/plain; charset=utf-8', 'Content-Transfer-Encoding: base64', '', Buffer.from(text).toString('base64')]
  // With HTML, the text and the HTML are two versions of one body, in a multipart/alternative part.
  const body = html === undefined ? plain : [`Content-Type: multipart/alternative; boundary="${boundary}-alt"`, '', `--${boundary}-alt`, ...plain, `--${boundary}-alt`, 'Content-Type: text/html; charset=utf-8', 'Content-Transfer-Encoding: base64', '', Buffer.from(html).toString('base64'), `--${boundary}-alt--`]
  const parts = [
    body,
    ...attachments.map(({ filename, type = 'application/octet-stream', content }) => [`Content-Type: ${type}`, `Content-Disposition: attachment; filename="${filename}"`, 'Content-Transfer-Encoding: base64', '', Buffer.from(content).toString('base64')]),
  ]
  return [...head, '', ...parts.flatMap((part) => [`--${boundary}`, ...part]), `--${boundary}--`, ''].join('\r\n')
}
