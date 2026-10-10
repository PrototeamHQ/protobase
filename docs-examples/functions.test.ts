import { createHmac } from 'node:crypto'
import { DummyDriver, Kysely, PostgresAdapter, PostgresIntrospector, PostgresQueryCompiler } from 'kysely'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HttpProblem, type ApiFunction, type FunctionContext, type FunctionRecords } from '@protobase/server'
import hello from './functions/hello'
import notifyCustomer from './functions/notify-customer'
import paymentWebhook from './functions/payment-webhook'
import readyForPickup from './functions/ready-for-pickup'
import workshop from './functions/workshop'

// The documentation shows these functions; this keeps what it says about them true. Each runs with a context made
// here, as the server would pass it: the routes, roles and CORS around them are @protobase/server's tests.

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

const queries: string[] = []
const db = new Kysely<any>({
  dialect: { createAdapter: () => new PostgresAdapter(), createDriver: () => new DummyDriver(), createIntrospector: (kysely) => new PostgresIntrospector(kysely), createQueryCompiler: () => new PostgresQueryCompiler() },
  log: (event) => void queries.push(event.query.sql),
})

const repair = { id: 7, number: 'R-0007', customerId: 3, bike: 'Gazelle Orange', status: 'working' }
const customer = { id: 3, name: 'Sanne', phone: '+31 6 1234 5678' }

const fakeRecords = (rows: Record<string, Record<string, unknown>>) => ({
  get: vi.fn(async (resource: string) => ({ record: rows[resource]!, etag: '"v1"' })),
  update: vi.fn(async (resource: string, _key: unknown, data: Record<string, unknown>) => ({ record: { ...rows[resource], ...data }, etag: '"v2"' })),
  list: vi.fn(async () => ({ items: [{ number: 'R-0007', bike: 'Gazelle Orange', etag: '"v2"' }], next_page_token: '', total_size_estimate: 1 })),
  create: vi.fn(),
  delete: vi.fn(),
}) satisfies FunctionRecords

const contextWith = (records: FunctionRecords): FunctionContext => {
  const caller = { session: { user: { id: 'mo', roles: ['mechanic'] } }, records }
  return { name: 'test', db, ...caller, caller: async () => caller }
}

const call = async (fn: ApiFunction, path: string, init: RequestInit, context: FunctionContext) => {
  const request = new Request(`http://localhost${path}`, init)
  return typeof fn.handler === 'function' ? fn.handler(request, context) : fn.handler.fetch(request, context)
}

const post = (body: unknown) => ({ method: 'POST', body: JSON.stringify(body) })

const problemOf = (promise: Promise<unknown>) => promise.then(() => undefined, (error: unknown) => (error instanceof HttpProblem ? [error.status, error.slug] : error))

describe('hello', () => {
  it('greets the caller', async () => {
    const response = await call(hello, '/', {}, contextWith(fakeRecords({})))
    expect(await response.json()).toEqual({ message: 'Hello, mo', roles: ['mechanic'] })
  })
})

describe('ready-for-pickup', () => {
  it('moves a repair from the workshop to ready, as the caller, with the ETag it read', async () => {
    const records = fakeRecords({ repairs: repair })
    const response = await call(readyForPickup, '/', post({ repairId: 7 }), contextWith(records))
    expect(await response.json()).toEqual({ repair: { ...repair, status: 'ready' }, readyForCustomer: [{ number: 'R-0007', bike: 'Gazelle Orange' }] })
    expect(records.update).toHaveBeenCalledWith('repairs', 7, { status: 'ready' }, { etag: '"v1"' })
    expect(records.list).toHaveBeenCalledWith('repairs', { filter: 'customerId = 3 AND status = "ready"', fields: ['number', 'bike'] })
    expect(readyForPickup.options).toEqual({ roles: ['mechanic', 'desk'] })
  })

  it('refuses a repair that is not in the workshop, and a body without a repair id', async () => {
    const records = fakeRecords({ repairs: { ...repair, status: 'booked' } })
    expect(await problemOf(call(readyForPickup, '/', post({ repairId: 7 }), contextWith(records)))).toEqual([409, 'not-in-progress'])
    expect(records.update).not.toHaveBeenCalled()
    expect(await problemOf(call(readyForPickup, '/', post({ repair: 7 }), contextWith(records)))).toEqual([400, 'invalid-body'])
  })
})

describe('payment-webhook', () => {
  const event = JSON.stringify({ type: 'payment.succeeded', data: { reference: 'R-0007' } })
  const signed = (body: string, secret: string) => ({ method: 'POST', body, headers: { 'x-signature': `sha256=${createHmac('sha256', secret).update(body).digest('hex')}` } })

  it('marks the repair paid when the provider signed the event, and refuses anything else', async () => {
    vi.stubEnv('PAYMENTS_WEBHOOK_SECRET', 'whsec-test')
    queries.length = 0
    const response = await call(paymentWebhook, '/', signed(event, 'whsec-test'), contextWith(fakeRecords({})))
    expect(response.status).toBe(204)
    expect(queries).toEqual(['update "shop"."repairs" set "paid" = $1 where "number" = $2'])
    expect(await problemOf(call(paymentWebhook, '/', signed(event, 'someone-else'), contextWith(fakeRecords({}))))).toEqual([401, 'invalid-signature'])
    expect(paymentWebhook.options).toEqual({ public: true })
  })
})

describe('notify-customer', () => {
  it('texts the customer through the SMS provider with the key from the environment', async () => {
    vi.stubEnv('SMS_API_KEY', 'sms-key')
    const fetch = vi.fn(async () => new Response(null, { status: 201 }))
    vi.stubGlobal('fetch', fetch)
    const response = await call(notifyCustomer, '/', post({ repairId: 7 }), contextWith(fakeRecords({ repairs: repair, customers: customer })))
    expect(await response.json()).toEqual({ sent: true })
    expect(fetch).toHaveBeenCalledWith('https://api.sms.example/v1/messages', expect.objectContaining({ headers: expect.objectContaining({ authorization: 'Bearer sms-key' }) }))
    expect(JSON.parse(String((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body))).toEqual({ to: '+31 6 1234 5678', text: 'Hi Sanne, your Gazelle Orange is ready for pickup.' })
  })

  it('fails without the key, before calling anyone', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    await expect(call(notifyCustomer, '/', post({ repairId: 7 }), contextWith(fakeRecords({ repairs: repair, customers: customer })))).rejects.toThrow('The environment variable SMS_API_KEY is not set')
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('workshop', () => {
  it('lists the queue and advances a repair, as the mechanic', async () => {
    const records = fakeRecords({ repairs: repair })
    const queue = await call(workshop, '/queue', {}, contextWith(records))
    expect(await queue.json()).toHaveLength(1)
    const advanced = await call(workshop, '/7/advance', { method: 'POST' }, contextWith(records))
    expect(await advanced.json()).toMatchObject({ status: 'ready' })
    expect(records.update).toHaveBeenCalledWith('repairs', 7, { status: 'ready' }, { etag: '"v1"' })
    expect(workshop.options).toEqual({ roles: ['mechanic'], cors: { origin: 'https://workshop.pips-bikes.example' } })
  })

  it('leaves a repair outside the workshop alone, with a problem the server renders', async () => {
    const records = fakeRecords({ repairs: { ...repair, status: 'ready' } })
    expect(await problemOf(call(workshop, '/7/advance', { method: 'POST' }, contextWith(records)))).toEqual([400, 'not-in-workshop'])
  })
})
