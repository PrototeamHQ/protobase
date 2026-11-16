/** @jsxImportSource @protobase/layout */
import { ArrayField, Button, Divider, RecordsIterator, Show, Table, Text, Trans, translations } from '@protobase/layout'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { defineTemplate, TemplateDataError } from './define-template'

const texts = translations({
  en: {
    subject: 'We received your message, {name}',
    greeting: 'Hi {name},',
    thanks: '{days, plural, one {We answer within # working day.} other {We answer within # working days.}}',
    sales: 'A sales colleague will <b>call you</b>.',
    cta: 'View your message',
  },
  nl: {
    subject: 'We hebben je bericht ontvangen, {name}',
    greeting: 'Hoi {name},',
    thanks: '{days, plural, one {We antwoorden binnen # werkdag.} other {We antwoorden binnen # werkdagen.}}',
    sales: 'Een collega van sales <b>belt je</b>.',
    cta: 'Bekijk je bericht',
  },
})

const contact = z.object({ name: z.string(), topic: z.enum(['sales', 'support']), days: z.number(), id: z.string(), lines: z.array(z.object({ text: z.string() })).optional() })

const autoReply = defineTemplate({
  name: 'contact-auto-reply',
  texts,
  schema: contact,
  subject: ({ data }) => <Trans i18nKey="subject" values={{ name: data.name }} />,
  body: ({ data, app }) => (
    <>
      <Text as="h1">
        <Trans i18nKey="greeting" values={{ name: data.name }} />
      </Text>
      <Text>
        <Trans i18nKey="thanks" values={{ days: data.days }} />
      </Text>
      <Show when={data.topic.eq('sales')}>
        <Text>
          <Trans i18nKey="sales" values={{}} components={{ b: <Text as="strong" /> }} />
        </Text>
      </Show>
      <Divider />
      <Button href={`${app.url}/contact/${data.id}`}>
        <Trans i18nKey="cta" />
      </Button>
    </>
  ),
})

const data = { name: 'Sam', topic: 'sales' as const, days: 2, id: 'c7' }
const app = { name: 'Acme', url: 'https://acme.test/' }

describe('an email template', () => {
  it('renders in the language asked for, its plurals, conditions, tags and addresses filled', async () => {
    const nl = await autoReply.render(data, { locale: 'nl-BE', app })
    expect(nl.locale).toBe('nl')
    expect(nl.subject).toBe('We hebben je bericht ontvangen, Sam')
    expect(nl.html).toMatch(/<html dir="ltr" lang="nl">.*<body lang="nl"/s)
    expect(nl.html).toContain('Hoi Sam,')
    expect(nl.html).toContain('binnen 2 werkdagen')
    expect(nl.html).toContain('<strong>belt je</strong>')
    expect(nl.html).toContain('href="https://acme.test/contact/c7"')
    expect(nl.text).toContain('Bekijk je bericht')

    const en = await autoReply.render({ ...data, topic: 'support', days: 1 }, { locale: 'de', app })
    expect(en.locale).toBe('en')
    expect(en.html).toContain('within 1 working day.')
    expect(en.html).not.toContain('sales colleague')
  })

  it("refuses data its schema refuses, naming the path, and gives the schema's JSON Schema", async () => {
    await expect(autoReply.render({ ...data, days: 'two' } as never)).rejects.toThrow(TemplateDataError)
    await expect(autoReply.render({ ...data, days: 'two' } as never)).rejects.toThrow(/days:/)
    expect(autoReply.dataSchema).toMatchObject({ type: 'object', required: expect.arrayContaining(['name', 'topic', 'days', 'id']) })
    expect(autoReply.languages).toEqual(['en', 'nl'])
  })

  it('derives its data from what it reads without a schema, a list with its items', async () => {
    const digest = defineTemplate<{ name: string; items: { title: string }[] }>({
      name: 'digest',
      subject: ({ data }) => `Your digest, ${data.name}`,
      body: () => (
        <ArrayField source="items">
          <RecordsIterator>
            <Text>{'{{title}} for {{@root.name}}'}</Text>
          </RecordsIterator>
        </ArrayField>
      ),
    })
    expect(digest.dataSchema).toEqual({
      type: 'object',
      properties: { name: {}, items: { type: 'array', items: { type: 'object', properties: { title: {} }, required: ['title'] } } },
      required: ['items', 'name'],
    })
    const sent = await digest.render({ name: 'Sam', items: [{ title: 'One' }, { title: 'Two' }] })
    expect(sent.subject).toBe('Your digest, Sam')
    expect(sent.html).toContain('One for Sam')
    expect(sent.html).toContain('Two for Sam')
  })

  it('carries header fields of its own, which may read the data', async () => {
    const digest = defineTemplate<{ unsubscribe_url: string }>({
      name: 'bulk',
      subject: 'News',
      headers: ({ data }) => ({ 'List-Unsubscribe': `<${data.unsubscribe_url}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' }),
      body: () => <Text>News</Text>,
    })
    expect((await digest.render({ unsubscribe_url: 'https://acme.test/u/1' })).headers).toEqual({ 'List-Unsubscribe': '<https://acme.test/u/1>', 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' })
    expect(digest.dataSchema).toMatchObject({ properties: { unsubscribe_url: {} } })
  })

  it('refuses a block an email cannot draw, a key its texts lack, and a bad name', () => {
    expect(() => defineTemplate({ name: 'x', subject: 'X', body: () => <Table resource="tasks" /> })).toThrow(/<Table> does not draw in an email/)
    expect(() => defineTemplate({ name: 'y', texts, subject: <Trans i18nKey="nope" />, body: () => <Text>y</Text> })).toThrow(/no language has "nope"/)
    expect(() => defineTemplate({ name: 'Bad Name', subject: 'X', body: () => null })).toThrow(/must start with a lowercase letter/)
  })

  it('sends through the mailer it is given, in the language it picked', async () => {
    const sent: unknown[] = []
    const result = await autoReply.send('sam@example.test', data, { locale: 'en', app, mailer: { send: async (message) => void sent.push(message) } })
    expect(result.locale).toBe('en')
    expect(sent).toEqual([expect.objectContaining({ to: 'sam@example.test', subject: 'We received your message, Sam' })])
  })
})
