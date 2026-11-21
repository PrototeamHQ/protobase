import { describe, expect, it } from 'vitest'
import { Text, translations } from '@protobase/layout'
import { StepError } from '@protobase/workflows'
import { z } from 'zod'
import type { MailMessage } from '../mail/mail-message'
import { defineTemplate } from '../mail/template/define-template'
import { bulkMailer } from '../mail/unsubscribe/bulk-mailer'
import { builtInStep } from './testing/built-in-step'

const context = (runId = 'run-1') => ({ runId, signal: new AbortController().signal, idempotencyKey: `${runId}//3`, log: () => undefined, redact: (text: string) => text, secret: () => {} })
const failure = (promise: Promise<unknown>) => promise.then(() => undefined, (error: unknown) => (error instanceof StepError ? [error.error, error.reason] : error))

// The jobs' mail over a recording transport, with opt-outs kept as `topic recipient` and links naming both.
const seriesMail = (optedOut: string[] = []) => {
  const sent: MailMessage[] = []
  const transport = { send: async (message: MailMessage) => { sent.push(message); return { messageId: message.headers?.['Message-ID'] } } }
  const links = { url: ({ recipient, topic }: { recipient: string; topic: string }) => `https://shop.example.com/api/unsubscribe/${topic}/${recipient}`, read: () => undefined }
  const unsubscribed = async (topic: string, recipients: readonly string[]) => recipients.filter((recipient) => optedOut.includes(`${topic} ${recipient}`))
  return { sent, mail: bulkMailer(transport, { links, unsubscribed }) }
}

describe('a mail step in an email series', () => {
  it('sends the mail as bulk mail of the series, with each recipient their own one-click unsubscribe from it', async () => {
    const { sent, mail } = seriesMail()
    const step = builtInStep('app:mail.send', { mail })
    const result = await step({ to: ['ada@example.com', 'bob@example.com'], subject: 'Welcome', text: 'Hi', series: 'welcome' }, context())
    expect(result).toEqual({ message_id: '<run-1..3@workflows.invalid>', sent: ['ada@example.com', 'bob@example.com'], skipped: [] })
    expect(sent.map((message) => [message.to, message.headers])).toEqual([
      ['ada@example.com', { 'Message-ID': '<run-1..3@workflows.invalid>', 'List-Unsubscribe': '<https://shop.example.com/api/unsubscribe/welcome/ada@example.com>', 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' }],
      ['bob@example.com', { 'Message-ID': '<run-1..3@workflows.invalid>', 'List-Unsubscribe': '<https://shop.example.com/api/unsubscribe/welcome/bob@example.com>', 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' }],
    ])
  })

  it('sends nothing to whoever unsubscribed from the series, and still sends them another series', async () => {
    const { sent, mail } = seriesMail(['welcome ada@example.com'])
    const step = builtInStep('app:mail.send', { mail })
    expect(await step({ to: 'ada@example.com', subject: 'Tips', text: 'Hi', series: 'welcome' }, context())).toEqual({ sent: [], skipped: ['ada@example.com'] })
    expect(sent).toEqual([])
    expect(await step({ to: 'ada@example.com', subject: 'News', text: 'Hi', series: 'news' }, context())).toMatchObject({ sent: ['ada@example.com'], skipped: [] })
  })

  it('sends a template in the series, skipped for whoever unsubscribed from it', async () => {
    const welcome = defineTemplate({ name: 'welcome', texts: translations({ en: { hi: 'Hi' } }), schema: z.object({ name: z.string() }), subject: 'Welcome, {{name}}', body: () => Text({ children: 'Hi {{name}}' }) })
    const { sent, mail } = seriesMail(['welcome bob@example.com'])
    const step = builtInStep('app:mail.template', { mail, templates: { list: [welcome], app: { name: 'Acme', url: 'https://acme.test/' } } })
    expect(await step({ template: 'welcome', to: 'ada@example.com', data: { name: 'Ada' }, series: 'welcome' }, context())).toEqual({ message_id: '<run-1..3@workflows.invalid>', sent: ['ada@example.com'], skipped: [], locale: 'en' })
    expect(sent.at(-1)!.headers).toMatchObject({ 'List-Unsubscribe': '<https://shop.example.com/api/unsubscribe/welcome/ada@example.com>' })
    expect(await step({ template: 'welcome', to: 'bob@example.com', data: { name: 'Bob' }, series: 'welcome' }, context())).toEqual({ sent: [], skipped: ['bob@example.com'], locale: 'en' })
    expect(sent).toHaveLength(1)
  })

  it('refuses a series that is no topic, and a series without the app\'s unsubscribe', async () => {
    const { sent, mail } = seriesMail()
    expect(await failure(builtInStep('app:mail.send', { mail })({ to: 'ada@example.com', subject: 'Hi', text: '', series: 'Welcome Mails' }, context()))).toEqual(['Mail.InvalidArguments', 'series must match pattern "^[a-z][a-z0-9_-]{0,62}$"'])
    const unlinked = bulkMailer({ send: async () => ({}) }, undefined)
    await expect(builtInStep('app:mail.send', { mail: unlinked })({ to: 'ada@example.com', subject: 'Hi', text: '', series: 'welcome' }, context())).rejects.toThrow('Bulk mail needs its one-click unsubscribe: turn it on with unsubscribe: true in protobase.config.ts')
    expect(sent).toEqual([])
  })

  it('leaves mail without a series as it was: one message, no unsubscribe', async () => {
    const { sent, mail } = seriesMail()
    expect(await builtInStep('app:mail.send', { mail })({ to: 'ada@example.com', subject: 'Receipt', text: 'Paid' }, context())).toEqual({ message_id: '<run-1..3@workflows.invalid>' })
    expect(sent.at(-1)!.headers).toEqual({ 'Message-ID': '<run-1..3@workflows.invalid>' })
  })
})
