import { StepError, type PluginMailMessage, type StepContext, type StepType } from '@protobase/workflows/plugin'

/** The most addresses one `app:mail.send` step sends to. */
export const mailRecipients = 50

/** The most bytes the attachments of one mail hold together. */
const attachmentBytes = 10 * 1024 * 1024

const invalid = (reason: string) => new StepError('Mail.InvalidArguments', reason)

// One line of text: a line break would start another header of the message.
const line = (value: unknown, name: string) => {
  if (typeof value !== 'string' || value.trim() === '') throw invalid(`${name} must be text`)
  if (/[\r\n]/.test(value)) throw invalid(`${name} must be one line`)
  return value
}

// Each item one address: the mailer reads a comma or semicolon as the start of another, past the count checked here.
const recipients = (value: unknown) => {
  const list = Array.isArray(value) ? value : [value]
  if (list.length === 0 || list.length > mailRecipients) throw invalid(`to must be one address or a list of 1 to ${mailRecipients}`)
  return list
    .map((address, index) => {
      const name = Array.isArray(value) ? `to[${index}]` : 'to'
      if (/[,;]/.test(line(address, name))) throw invalid(`${name} must be one address; give several as a list`)
      return address as string
    })
    .join(', ')
}

const attachmentsOf = async (value: unknown, { files }: StepContext): Promise<NonNullable<PluginMailMessage['attachments']>> => {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value)) throw invalid('attachments must be a list of file values')
  const attachments: NonNullable<PluginMailMessage['attachments']> = []
  let total = 0
  for (const [index, item] of value.entries()) {
    const file = await files.read(item, `attachments[${index}]`)
    total += file.bytes.length
    if (total > attachmentBytes) throw invalid(`attachments are larger than ${attachmentBytes / 1024 / 1024} MiB together`)
    attachments.push({ filename: file.name, content: file.bytes, ...(file.type && { contentType: file.type }) })
  }
  return attachments
}

const send = async (context: StepContext) => {
  const { input, mail, idempotencyKey } = context
  if (!mail) throw new StepError('States.TaskFailed', 'The app sends no mail: set its mailer, or PROTOBASE_SMTP_URL and PROTOBASE_MAIL_FROM')
  if (typeof input.text !== 'string') throw invalid('text must be text')
  if (input.html !== undefined && typeof input.html !== 'string') throw invalid('html must be text')
  const messageId = `<${idempotencyKey.replace(/[^A-Za-z0-9.-]/g, '.')}@workflows.invalid>`
  await mail.send({
    to: recipients(input.to),
    subject: line(input.subject, 'subject'),
    text: input.text,
    ...(input.html !== undefined && { html: input.html }),
    headers: { 'Message-ID': messageId },
    attachments: await attachmentsOf(input.attachments, context),
  })
  return { message_id: messageId }
}

/**
 * `app:mail.send`: one message from the app's own sender; a workflow cannot set the sender. Its Message-ID comes from
 * the step's idempotency key, the same for each try, so a receiver can tell a repeated try from a new mail.
 */
export const mailSteps: Record<string, StepType> = {
  'mail.send': {
    label: 'Send mail',
    description: "Sends a mail from the app's own sender.",
    errorPrefix: 'Mail',
    writes: true,
    input: {
      type: 'object',
      required: ['to', 'subject', 'text'],
      properties: {
        to: { description: `one address, or a list of at most ${mailRecipients}` },
        subject: { description: 'one line of text' },
        text: { description: 'the body as text' },
        html: { description: 'the body as HTML too' },
        attachments: { description: 'a list of file values the run keeps, at most 10 MiB together' },
      },
    },
    output: { type: 'object', description: '{ message_id }', properties: { message_id: { type: 'string' } } },
    errors: { InvalidArguments: 'an argument has the wrong type, named in the cause' },
    run: send,
  },
}
