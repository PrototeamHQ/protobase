import { describe, expect, it } from 'vitest'
import { checkDefinition } from '../definition/check-definition'
import type { Definition } from '../definition/types'
import { StepError } from '../run/errors'
import { memoryRunner } from '../run/memory-port'
import type { TaskHandlers } from '../run/port'
import a from './a.json'
import b from './b.json'
import c from './c.json'
import d from './d.json'
import e from './e.json'
import f from './f.json'
import g from './g.json'

/** The seven reference flows of the decided language report, a to g, as it gives them. */
const flows = { a, b, c, d, e, f, g } as unknown as Record<string, Definition>

const resources = ['app:http', 'app:records.create', 'app:records.update', 'app:records.get', 'app:records.list', 'app:mail.send', 'app:piece']

type Call = { resource: string; args: Record<string, unknown> }

// Step types that record each call and answer as the app's would: http by URL, records as created or updated.
const fakeApp = (answers: Record<string, unknown> = {}, failing = new Set<string>()) => {
  const calls: Call[] = []
  const recorded = (resource: string, answer: (args: Record<string, unknown>) => unknown) => async (args: unknown) => {
    calls.push({ resource, args: args as Record<string, unknown> })
    return answer(args as Record<string, unknown>)
  }
  const tasks: TaskHandlers = {
    'app:http': recorded('app:http', (args) => {
      const url = String(args.url)
      if (failing.has(url)) throw new StepError('Http.Status', `${new URL(url).host} answered 502`)
      return { status: 200, headers: {}, body: answers[url] ?? {} }
    }),
    'app:records.create': recorded('app:records.create', (args) => args.data),
    'app:records.update': recorded('app:records.update', (args) => ({ id: args.key, ...(args.data as object) })),
    'app:mail.send': recorded('app:mail.send', () => ({ message_id: '<1@app>' })),
    'app:piece': recorded('app:piece', () => ({ channel: 'C0SALES01', ts: '1730000000.000100', message: {} })),
  }
  return { calls, tasks }
}

const run = async (name: string, input: unknown, app: ReturnType<typeof fakeApp>) => {
  const port = memoryRunner(app.tasks, { secrets: { TICKETS_TOKEN: 'tickets-secret-1' } })
  await port.start(name, flows[name]!, input)
  await port.drain()
  return port
}

const mail = (subject: string) => ({ from: 'ada@example.com', to: 'support@app.test', subject, text: 'Please help', html: null, received_at: '2026-11-04T08:00:00Z', attachments: [] })

describe('the reference flows of the language report', () => {
  it.each(Object.keys(flows))('flow %s passes the check with the app\'s step types', (name) => {
    expect(checkDefinition(flows[name], { resources })).toEqual([])
  })

  it('a: a webhook POST becomes a lead', async () => {
    const app = fakeApp()
    const body = { contact: { first_name: 'Ada', last_name: 'Lovelace', email: 'ADA@Example.com' }, company: { name: 'Analytical Engines' }, message: 'Please call me', submitted_at: '2026-10-30T09:15:00Z' }
    const port = await run('a', { body, headers: {}, query: {} }, app)
    expect(port.run('a').status).toBe('succeeded')
    expect(app.calls).toEqual([{ resource: 'app:records.create', args: { resource: 'leads', data: { name: 'Ada Lovelace', email: 'ada@example.com', company: 'Analytical Engines', notes: 'Please call me', received_at: '2026-10-30T09:15:00Z' } } }])
  })

  it('b: an invoice mail goes to accounting, any other becomes a ticket with the secret token', async () => {
    const invoice = fakeApp()
    expect((await run('b', mail('Your INVOICE 42'), invoice)).run('b').status).toBe('succeeded')
    expect(invoice.calls).toEqual([{ resource: 'app:mail.send', args: { to: 'accounting@example.com', subject: 'Invoice from ada@example.com', text: 'Please help' } }])

    const other = fakeApp()
    const port = await run('b', mail('Broken login'), other)
    expect(other.calls).toEqual([{
      resource: 'app:http',
      args: { method: 'POST', url: 'https://tickets.example.com/api/tickets', headers: { Authorization: 'Bearer tickets-secret-1' }, body: { title: 'Broken login', body: 'Please help', reporter: 'ada@example.com' } },
    }])
    expect(JSON.stringify(port.steps)).not.toContain('tickets-secret-1')
  })

  it('c: products updated since the day before, priced five at once, saved as records', async () => {
    const app = fakeApp({
      'https://api.example.com/v1/products': { items: [{ sku: 'A1', name: 'Lamp' }, { sku: 'B2', name: 'Desk' }] },
      'https://api.example.com/v1/products/A1/price': { amount: 12.5, currency: 'EUR' },
      'https://api.example.com/v1/products/B2/price': { amount: 80, currency: 'EUR' },
    })
    const port = await run('c', { scheduled_at: '2026-11-04T06:00:00+01:00' }, app)
    expect(port.run('c').status).toBe('succeeded')
    expect(app.calls[0]).toEqual({ resource: 'app:http', args: { method: 'GET', url: 'https://api.example.com/v1/products', query: { updated_since: '2026-11-03' } } })
    expect(app.calls.at(-1)).toEqual({
      resource: 'app:records.create',
      args: { resource: 'products', data: [{ sku: 'A1', name: 'Lamp', price: 12.5, currency: 'EUR' }, { sku: 'B2', name: 'Desk', price: 80, currency: 'EUR' }] },
    })
  })

  it('d: a charge retried 3 times after the first try, then the order marked and ops mailed the error', async () => {
    const app = fakeApp({}, new Set(['https://payments.example.com/charges']))
    const port = await run('d', { event: 'orders.created', resource: 'orders', key: '17', after: { id: 17, customer_email: 'c@example.com', total: 99.5 } }, app)
    expect(port.run('d').status).toBe('succeeded')
    expect(app.calls.filter((call) => call.resource === 'app:http')).toHaveLength(4)
    expect(port.steps.filter((step) => step.state === 'Charge').map((step) => step.status)).toEqual(['retrying', 'retrying', 'retrying', 'caught'])
    expect(app.calls.slice(4)).toEqual([
      { resource: 'app:records.update', args: { resource: 'orders', key: 17, data: { status: 'payment_failed' } } },
      { resource: 'app:mail.send', args: { to: 'ops@example.com', subject: 'Payment failed for order 17', text: 'payments.example.com answered 502' } },
    ])
  })

  it('e: every mail saved first, and an invoice mail goes to accounting and then becomes a ticket too', async () => {
    const app = fakeApp()
    expect((await run('e', mail('Invoice 9'), app)).run('e').status).toBe('succeeded')
    expect(app.calls.map((call) => call.resource)).toEqual(['app:records.create', 'app:mail.send', 'app:http'])
    expect(app.calls[0]!.args).toEqual({ resource: 'mails', data: { sender: 'ada@example.com', subject: 'Invoice 9', received_at: '2026-11-04T08:00:00Z' } })
  })

  it('f: a new lead posted through a piece, and the lead keeps the message\'s timestamp', async () => {
    const app = fakeApp()
    const port = await run('f', { event: 'leads.created', resource: 'leads', key: '5', after: { id: 5, name: 'Ada', email: 'ada@example.com', company: 'AE' } }, app)
    expect(port.run('f').status).toBe('succeeded')
    expect(app.calls).toEqual([
      { resource: 'app:piece', args: { piece: 'slack', action: 'send_channel_message', connection: 'sales_slack', props: { channel: 'C0SALES01', text: 'New lead: Ada from AE (ada@example.com)' } } },
      { resource: 'app:records.update', args: { resource: 'leads', key: 5, data: { slack_ts: '1730000000.000100' } } },
    ])
  })

  it('g: a downloaded file saved on a record and mailed with its size', async () => {
    const pdf = { uri: 'private:workflows/g/1?name=latest.pdf&size=5120', name: 'latest.pdf', type: 'application/pdf', size: 5120 }
    const app = fakeApp({ 'https://reports.example.com/sales/latest.pdf': pdf })
    const port = await run('g', { scheduled_at: '2026-11-02T07:00:00+01:00' }, app)
    expect(port.run('g').status).toBe('succeeded')
    expect(app.calls).toEqual([
      { resource: 'app:http', args: { method: 'GET', url: 'https://reports.example.com/sales/latest.pdf', response: 'file' } },
      { resource: 'app:records.create', args: { resource: 'reports', data: { title: 'Rapport des ventes — édition hebdomadaire', pdf } } },
      { resource: 'app:mail.send', args: { to: 'finance@example.com', subject: 'Rapport des ventes', attachments: [pdf], text: 'Bonjour, ci-joint le rapport des ventes (5120 octets).' } },
    ])
  })
})
