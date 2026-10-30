import type { MailMessage } from './mail-message'

/**
 * `message` as Nodemailer composes it: its header fields checked, and its attachments as their bytes alone, with
 * Nodemailer's reads of a file path or URL turned off, so no attachment can name a file on the server or a URL to fetch.
 */
export const composerMessage = ({ attachments, ...message }: MailMessage) => {
  checkHeaders(message.headers)
  if (!attachments?.length) return message
  return {
    ...message,
    attachments: attachments.map(({ filename, content, contentType }) => ({ filename, content: Buffer.from(content), ...(contentType && { contentType }) })),
    disableFileAccess: true,
    disableUrlAccess: true,
  }
}

// A line break in a value would start another header or the body; a name is the printable characters but a colon, as
// RFC 5322 allows.
const checkHeaders = (headers: Record<string, string> = {}) => {
  for (const [name, value] of Object.entries(headers)) {
    if (!/^[!-9;-~]+$/.test(name)) throw new Error(`Mail header name "${name}" is not a valid header field name`)
    if (/[\r\n]/.test(value)) throw new Error(`Mail header ${name} has a line break; a header value is one line`)
  }
}
