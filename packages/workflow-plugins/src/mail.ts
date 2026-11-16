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

const mailOff = () => new StepError('States.TaskFailed', 'The app sends no mail: set its mailer, or PROTOBASE_SMTP_URL and PROTOBASE_MAIL_FROM')

// The same for each try of one visit of the step, so a receiver can tell a repeated try from a new mail
const messageIdOf = (idempotencyKey: string) => `<${idempotencyKey.replace(/[^A-Za-z0-9.-]/g, '.')}@workflows.invalid>`

const send = async (context: StepContext) => {
  const { input, mail, idempotencyKey } = context
  if (!mail) throw mailOff()
  if (typeof input.text !== 'string') throw invalid('text must be text')
  if (input.html !== undefined && typeof input.html !== 'string') throw invalid('html must be text')
  const messageId = messageIdOf(idempotencyKey)
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

// The paths and messages of data a template's schema refused, as its send rejects it
const dataIssues = (error: unknown) => {
  const issues = typeof error === 'object' && error !== null ? (error as { issues?: unknown }).issues : undefined
  return Array.isArray(issues) ? (issues as { path?: unknown; message?: unknown }[]) : undefined
}

const sendTemplate = async ({ input, mail, templates, idempotencyKey }: StepContext) => {
  if (!mail) throw mailOff()
  const template = templates.list.find((each) => each.name === input.template)
  if (!template) {
    const known = templates.list.map((each) => each.name)
    throw new StepError('Mail.UnknownTemplate', `The app has no email template "${String(input.template)}"; ${known.length > 0 ? `it has ${known.join(', ')}` : 'it exports none'}`)
  }
  const to = recipients(input.to)
  const locale = input.locale === undefined ? undefined : line(input.locale, 'locale')
  if (locale !== undefined) {
    try {
      Intl.getCanonicalLocales(locale)
    } catch {
      throw invalid('locale must be a BCP 47 language tag, such as nl or en-GB')
    }
  }
  const messageId = messageIdOf(idempotencyKey)
  const mailer = { send: (message: PluginMailMessage) => mail.send({ ...message, headers: { ...message.headers, 'Message-ID': messageId } }) }
  try {
    const sent = await template.send(to, (input.data ?? {}) as object, { ...(locale !== undefined && { locale }), mailer, app: templates.app })
    return { message_id: messageId, locale: sent.locale }
  } catch (error) {
    const issues = dataIssues(error)
    if (!issues) throw error
    throw new StepError('Mail.InvalidData', issues.map((issue) => `${['data', ...(issue.path ? [String(issue.path)] : [])].join('.')}: ${String(issue.message)}`).join('; '))
  }
}

/**
 * `app:mail.send`: one message from the app's own sender; a workflow cannot set the sender. `app:mail.template`: one of
 * the app's email templates, rendered with the step's data in the language closest to its locale, from the same
 * sender. Each one's Message-ID comes from the step's idempotency key, the same for each try, so a receiver can tell a
 * repeated try from a new mail.
 */
export const mailSteps: Record<string, StepType> = {
  'mail.send': {
    label: 'Send plain mail',
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
  'mail.template': {
    label: 'Send email',
    description: "Sends one of the app's email templates from the app's own sender, in the language closest to locale, its data checked by the template's schema.",
    errorPrefix: 'Mail',
    writes: true,
    input: {
      type: 'object',
      required: ['template', 'to'],
      properties: {
        template: { type: 'string', description: "the name of one of the app's email templates" },
        to: { type: 'string', description: 'one address' },
        locale: { type: 'string', 'x-email-of': 'template', 'x-email-use': 'locale', description: "a BCP 47 language tag, such as nl or en-GB; the template's language closest to it, else the app's" },
        data: { type: 'object', 'x-email-of': 'template', description: "the template's data, as its schema takes it" },
      },
    },
    output: { type: 'object', description: '{ message_id, locale }', properties: { message_id: { type: 'string' }, locale: { type: 'string' } } },
    errors: {
      InvalidArguments: 'an argument has the wrong type, named in the cause',
      InvalidData: "the template's schema refused the data, each path named in the cause",
      UnknownTemplate: 'the app has no email template of that name',
    },
    run: sendTemplate,
  },
}
