import { DummyDriver, Kysely, PostgresAdapter, PostgresIntrospector, PostgresQueryCompiler } from 'kysely'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FatalJobError, type FunctionContext, type JobContext, type MailMessage, type WriteEvent } from '@protobase/server'
import emailReadyRepair from './email/hooks/email-ready-repair'
import emailRepairReady from './email/jobs/email-repair-ready'
import config from './email/protobase.config'
import { repairReady } from './email/emails/repair-ready'
import resendRepairReady from './email/functions/resend-repair-ready'

// The documentation shows these files; this keeps what it says about them true.

const data = { customer: 'Sanne', bike: 'Gazelle Orange', number: 'R-0007', url: 'https://bikeshop.example.com/repairs/R-0007' }

// A database whose every query answers `rows`.
const answering = (rows: Record<string, unknown>[]) =>
  new Kysely<any>({
    dialect: {
      createAdapter: () => new PostgresAdapter(),
      createDriver: () => Object.assign(new DummyDriver(), { acquireConnection: async () => ({ executeQuery: async () => ({ rows }), streamQuery: async function* () {} }) }),
      createIntrospector: (kysely) => new PostgresIntrospector(kysely),
      createQueryCompiler: () => new PostgresQueryCompiler(),
    },
  })

const contextWith = (db: Kysely<any>, mail?: JobContext['mail']): JobContext => ({
  db,
  job: { id: '1', name: 'email-repair-ready', attempt: 1, maxAttempts: 10, startedOn: new Date() },
  signal: new AbortController().signal,
  decryptField: vi.fn(),
  ...(mail && { mail }),
})

describe('the repair-ready email', () => {
  it('renders its subject, HTML and plain text from typed data', async () => {
    const email = await repairReady.render(data)
    expect(email.subject).toBe('Your Gazelle Orange is ready for pickup')
    expect(email.html).toContain('href="https://bikeshop.example.com/repairs/R-0007"')
    expect(email.text).toContain('Hi Sanne, your Gazelle Orange is ready. Bring repair number R-0007 when you come by.')
    expect(email.text).toContain('See the repair https://bikeshop.example.com/repairs/R-0007')
  })

  it('is sent by the job, through the mail it gets', async () => {
    const sent: MailMessage[] = []
    const db = answering([{ number: 'R-0007', bike: 'Gazelle Orange', name: 'Sanne', email: 'sanne@example.com' }])
    await emailRepairReady({ repairId: 7 }, contextWith(db, { send: async (message) => void sent.push(message) }))
    expect(sent).toEqual([{ to: 'sanne@example.com', subject: 'Your Gazelle Orange is ready for pickup', html: expect.stringContaining('R-0007'), text: expect.stringContaining('Hi Sanne') }])
  })

  it('fails the job for good while mail is off', async () => {
    await expect(emailRepairReady({ repairId: 7 }, contextWith(answering([])))).rejects.toThrow(FatalJobError)
  })

  it('is enqueued by the write hook of a repair that became ready', async () => {
    expect(config.writeHooks).toEqual(['email-ready-repair'])
    expect(config.jobs).toHaveProperty('email-repair-ready')
    const hook = emailReadyRepair
    const ready = { operation: 'update', resource: { name: 'repairs' }, user: { id: 1, roles: [] }, before: { status: 'working' }, after: { id: '7', status: 'ready' } } as unknown as WriteEvent
    await expect(hook!(ready, {} as never)).rejects.toThrow('Jobs are not running in this process')
    await expect(hook!({ ...ready, before: { status: 'ready' } }, {} as never)).resolves.toBeUndefined()
  })
})

describe('the function that sends it again', () => {
  afterEach(() => vi.unstubAllEnvs())

  const rows: Record<string, Record<string, unknown>> = {
    repairs: { id: 7, number: 'R-0007', customer_id: 3, bike: 'Gazelle Orange' },
    customers: { id: 3, name: 'Sanne', email: 'sanne@example.com' },
  }
  const contextWith = (customer: Record<string, unknown>) => {
    const records = { get: async (resource: string) => ({ record: resource === 'customers' ? customer : rows[resource]!, etag: '"v1"' }) }
    return { records } as unknown as FunctionContext
  }
  const call = (context: FunctionContext) => {
    const handler = resendRepairReady.handler as (request: Request, context: FunctionContext) => Promise<Response>
    return handler(new Request('http://localhost/', { method: 'POST', body: JSON.stringify({ repairId: 7 }) }), context)
  }

  it('answers without sending for a customer without an address', async () => {
    expect(await (await call(contextWith({ ...rows.customers, email: null }))).json()).toEqual({ sent: false, reason: 'The customer has no email address' })
  })

  it("sends through the app's SMTP server, so it fails while mail is off", async () => {
    vi.stubEnv('PROTOBASE_SMTP_URL', '')
    vi.stubEnv('PROTOBASE_MAIL_FROM', '')
    await expect(call(contextWith(rows.customers!))).rejects.toThrow('Email "repair-ready" cannot be sent: mail is off')
  })
})
