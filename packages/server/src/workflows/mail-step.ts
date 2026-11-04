import { StepError, type TaskHandler } from '@protobase/workflows'
import type { FilesRuntime } from '../files/runtime'
import type { MailAttachment, Mailer } from '../mail/mail-message'
import { readRunFile, runFileLimit } from './run-files'

/** The most addresses one `app:mail.send` step sends to. */
export const mailRecipients = 50

const invalid = (reason: string) => new StepError('Mail.InvalidArguments', reason)

// One line of text: a line break would start another header of the message.
const line = (value: unknown, name: string) => {
  if (typeof value !== 'string' || value.trim() === '') throw invalid(`${name} must be text`)
  if (/[\r\n]/.test(value)) throw invalid(`${name} must be one line`)
  return value
}

const recipients = (value: unknown) => {
  const list = Array.isArray(value) ? value : [value]
  if (list.length === 0 || list.length > mailRecipients) throw invalid(`to must be one address or a list of 1 to ${mailRecipients}`)
  return list.map((address, index) => line(address, Array.isArray(value) ? `to[${index}]` : 'to')).join(', ')
}

const attachmentsOf = async (value: unknown, files: FilesRuntime | undefined, runId: string): Promise<MailAttachment[]> => {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value)) throw invalid('attachments must be a list of file values')
  const attachments: MailAttachment[] = []
  let total = 0
  for (const [index, item] of value.entries()) {
    const { ref, bytes } = await readRunFile(files, runId, item, `attachments[${index}]`)
    total += bytes.length
    if (total > runFileLimit) throw invalid(`attachments are larger than ${runFileLimit / 1024 / 1024} MiB together`)
    attachments.push({ filename: ref.name, content: bytes, ...(ref.type && { contentType: ref.type }) })
  }
  return attachments
}

/**
 * The `app:mail.send` step: one message from the app's own sender, with the app's mailer; a workflow cannot set the
 * sender. Its Message-ID comes from the step's idempotency key, the same for each try, so a receiver can tell a
 * repeated try from a new mail.
 */
export const mailStep = (mail: () => Mailer | undefined, files: () => FilesRuntime | undefined): TaskHandler => async (args, { runId, idempotencyKey }) => {
  const given = (args ?? {}) as Record<string, unknown>
  const mailer = mail()
  if (!mailer) throw new StepError('States.TaskFailed', 'The app sends no mail: set its mailer, or PROTOBASE_SMTP_URL and PROTOBASE_MAIL_FROM')
  if (typeof given.text !== 'string') throw invalid('text must be text')
  if (given.html !== undefined && typeof given.html !== 'string') throw invalid('html must be text')
  const messageId = `<${idempotencyKey.replace(/[^A-Za-z0-9.-]/g, '.')}@workflows.invalid>`
  await mailer.send({
    to: recipients(given.to),
    subject: line(given.subject, 'subject'),
    text: given.text,
    ...(given.html !== undefined && { html: given.html }),
    headers: { 'Message-ID': messageId },
    attachments: await attachmentsOf(given.attachments, files(), runId),
  })
  return { message_id: messageId }
}
