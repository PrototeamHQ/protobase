import { createHmac } from 'node:crypto'
import { DummyDriver, Kysely, PostgresAdapter, PostgresIntrospector, PostgresQueryCompiler } from 'kysely'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HttpProblem, notFound, type ApiFunction, type FunctionContext, type FunctionRecords, type FunctionSocket, type SocketEvents } from '@protobase/server'
import display from './functions/display'
import displayTicket from './functions/display-ticket'
import hello from './functions/hello'
import notifyCustomer from './functions/notify-customer'
import paymentWebhook from './functions/payment-webhook'
import readyForPickup from './functions/ready-for-pickup'
import repairWatch from './functions/repair-watch'
import workshop from './functions/workshop'
import workshopChat from './functions/workshop-chat'

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

const repair = { id: 7, number: 'R-0007', customer_id: 3, bike: 'Gazelle Orange', status: 'working' }
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
  return { name: 'test', db, ...caller, caller: async () => caller, acceptWebSocket: () => new Response() }
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
    expect(records.list).toHaveBeenCalledWith('repairs', { filter: 'customer_id = 3 AND status = "ready"', fields: ['number', 'bike'] })
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

// A context whose acceptWebSocket keeps the events, as the server would before it upgrades.
const socketContextWith = (user: string) => {
  const accepted: SocketEvents[] = []
  const context: FunctionContext = {
    ...contextWith(fakeRecords({})),
    session: { user: { id: user, roles: ['mechanic'] } },
    acceptWebSocket: (events) => {
      accepted.push(events)
      return new Response(null, { headers: { accepted: 'yes' } })
    },
  }
  return { context, accepted }
}

const fakeSocket = () => ({ send: vi.fn(async (_data: string | ArrayBuffer | Uint8Array) => {}), close: vi.fn(), bufferedAmount: 0 }) satisfies FunctionSocket

describe('workshop-chat', () => {
  it('sends each text message to everyone in the chat, with who sent it, until they leave', async () => {
    const join = async (user: string) => {
      const { context, accepted } = socketContextWith(user)
      expect((await call(workshopChat, '/', { headers: { upgrade: 'websocket' } }, context)).headers.get('accepted')).toBe('yes')
      const socket = fakeSocket()
      await accepted[0]!.onOpen!(socket)
      return { events: accepted[0]!, socket }
    }
    const mo = await join('mo')
    const pip = await join('pip')
    await mo.events.onMessage!('Truing stand is free', mo.socket)
    await mo.events.onMessage!(new ArrayBuffer(4), mo.socket)
    expect(pip.socket.send.mock.calls).toEqual([['mo: Truing stand is free']])
    expect(mo.socket.send.mock.calls).toEqual([['mo: Truing stand is free']])

    await pip.events.onClose!(1000, '')
    await mo.events.onMessage!('Anyone?', mo.socket)
    expect(pip.socket.send).toHaveBeenCalledTimes(1)
    await mo.events.onClose!(1000, '')
  })
})

describe('display-ticket and display', () => {
  afterEach(() => vi.useRealTimers())

  const open = async (ticket: string) => {
    const { context, accepted } = socketContextWith('nobody')
    const response = await call(display, `/?ticket=${encodeURIComponent(ticket)}`, { headers: { upgrade: 'websocket' } }, context)
    const socket = fakeSocket()
    await accepted[0]!.onOpen!(socket)
    return { response, socket }
  }

  const ticketFor = async (user: string) => {
    const response = await call(displayTicket, '/', { method: 'POST' }, socketContextWith(user).context)
    return ((await response.json()) as { ticket: string }).ticket
  }

  it('opens the display board for a fresh ticket, which names its user', async () => {
    vi.stubEnv('TICKET_SECRET', 'ticket-secret')
    const { socket } = await open(await ticketFor('mo'))
    expect(socket.send).toHaveBeenCalledWith(JSON.stringify({ shownFor: 'mo' }))
    expect(displayTicket.options).toEqual({ roles: ['mechanic'], cors: { origin: 'https://workshop.pips-bikes.example' } })
    expect(display.options).toEqual({ public: true })
  })

  it('refuses a missing, forged or expired ticket with a 401 and no socket', async () => {
    vi.stubEnv('TICKET_SECRET', 'ticket-secret')
    const ticket = await ticketFor('mo')
    const forged = ticket.replace(/^mo\./, 'pip.')
    const { context, accepted } = socketContextWith('nobody')
    for (const bad of ['', forged, `${ticket.slice(0, -1)}x`]) {
      expect(await problemOf(call(display, `/?ticket=${encodeURIComponent(bad)}`, { headers: { upgrade: 'websocket' } }, context))).toEqual([401, 'unauthenticated'])
    }
    vi.useFakeTimers({ now: Date.now() + 31_000 })
    expect(await problemOf(call(display, `/?ticket=${encodeURIComponent(ticket)}`, { headers: { upgrade: 'websocket' } }, context))).toEqual([401, 'unauthenticated'])
    expect(accepted).toHaveLength(0)
  })

  it('ends the board’s socket 15 minutes after it opened, so it gets a new ticket', async () => {
    vi.stubEnv('TICKET_SECRET', 'ticket-secret')
    vi.useFakeTimers({ now: Date.now() })
    const { context, accepted } = socketContextWith('nobody')
    await call(display, `/?ticket=${encodeURIComponent(await ticketFor('mo'))}`, { headers: { upgrade: 'websocket' } }, context)
    vi.advanceTimersByTime(14 * 60_000)
    expect(() => accepted[0]!.recheck!()).not.toThrow()
    vi.advanceTimersByTime(60_000)
    expect(() => accepted[0]!.recheck!()).toThrow(expect.objectContaining({ status: 401 }))
  })
})

describe('repair-watch', () => {
  // Records that show repair 7 until `hide`, as a row filter would once it moves to another mechanic.
  const watchedRecords = () => {
    let visible = true
    const records = fakeRecords({ repairs: repair })
    records.get.mockImplementation(async (resource: string) => {
      if (!visible) throw notFound('No such record')
      return { record: { ...repair }, etag: '"v1"' }
    })
    return { records, hide: () => void (visible = false) }
  }

  it('refuses a repair the caller cannot see with a 404 and no socket', async () => {
    const { records, hide } = watchedRecords()
    hide()
    const { context, accepted } = socketContextWith('mo')
    expect(await problemOf(call(repairWatch, '/7', { headers: { upgrade: 'websocket' } }, { ...context, records }))).toEqual([404, 'not-found'])
    expect(await problemOf(call(repairWatch, '/seven', { headers: { upgrade: 'websocket' } }, { ...context, records }))).toEqual([404, 'not-found'])
    expect(accepted).toHaveLength(0)
  })

  it('sends the repair’s status on open, and its recheck rejects once the repair is out of sight', async () => {
    const { records, hide } = watchedRecords()
    const { context, accepted } = socketContextWith('mo')
    await call(repairWatch, '/7', { headers: { upgrade: 'websocket' } }, { ...context, records })
    const socket = fakeSocket()
    await accepted[0]!.onOpen!(socket)
    expect(socket.send).toHaveBeenCalledWith(JSON.stringify({ status: 'working' }))
    await expect(accepted[0]!.recheck!()).resolves.toBeDefined()
    expect(records.get).toHaveBeenLastCalledWith('repairs', 7)
    hide()
    await expect(accepted[0]!.recheck!()).rejects.toMatchObject({ status: 404 })
    expect(repairWatch.options).toEqual({ roles: ['mechanic', 'desk'] })
  })
})
