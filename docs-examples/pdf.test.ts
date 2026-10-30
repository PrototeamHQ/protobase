import { DummyDriver, Kysely, PostgresAdapter, PostgresIntrospector, PostgresQueryCompiler } from 'kysely'
import { describe, expect, it, vi } from 'vitest'
import { FatalJobError, type FunctionContext, type JobContext, type MailMessage } from '@protobase/server'
import { pdfText } from '../test-support/pdf-text'
import { repairQuote } from './pdf/documents/repair-quote'
import repairQuoteFunction from './pdf/functions/repair-quote'
import emailRepairQuote from './pdf/jobs/email-repair-quote'
import config from './pdf/protobase.config'

// The documentation shows these files; this keeps what it says about them true.

const quoteText = 'Quote R-0007For SanneGazelle Orange: Squeaky brakesEUR 45.00'

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
  job: { id: '1', name: 'email-repair-quote', attempt: 1, maxAttempts: 10, startedOn: new Date() },
  signal: new AbortController().signal,
  decryptField: vi.fn(),
  ...(mail && { mail }),
})

describe('the repair quote', () => {
  it('renders to a PDF file from typed data', async () => {
    const pdf = await repairQuote.render({ number: 'R-0007', customer: 'Sanne', bike: 'Gazelle Orange', problem: 'Squeaky brakes', estimate: 'EUR 45.00' })
    expect(Buffer.from(pdf.subarray(0, 5)).toString('latin1')).toBe('%PDF-')
    expect(pdfText(pdf)).toBe(quoteText)
  })

  it('is answered by the function as a PDF file', async () => {
    const rows: Record<string, Record<string, unknown>> = {
      repairs: { id: 7, number: 'R-0007', customer_id: 3, bike: 'Gazelle Orange', problem: 'Squeaky brakes', estimate: '45.00', currency: 'EUR' },
      customers: { id: 3, name: 'Sanne' },
    }
    const records = { get: async (resource: string) => ({ record: rows[resource]!, etag: '"v1"' }) }
    const handler = repairQuoteFunction.handler as (request: Request, context: FunctionContext) => Promise<Response>
    const response = await handler(new Request('http://localhost/7'), { records } as unknown as FunctionContext)
    expect(response.headers.get('content-disposition')).toBe('inline; filename="quote-R-0007.pdf"')
    expect(pdfText(new Uint8Array(await response.arrayBuffer()))).toBe(quoteText)
  })

  it('is emailed by the job as an attachment', async () => {
    expect(config.jobs).toHaveProperty('email-repair-quote')
    const sent: MailMessage[] = []
    const db = answering([{ number: 'R-0007', bike: 'Gazelle Orange', problem: 'Squeaky brakes', estimate: '45.00', currency: 'EUR', name: 'Sanne', email: 'sanne@example.com' }])
    await emailRepairQuote({ repairId: 7 }, contextWith(db, { send: async (message) => void sent.push(message) }))
    expect(sent).toEqual([expect.objectContaining({ to: 'sanne@example.com', subject: 'Quote R-0007 for your Gazelle Orange' })])
    const [attachment] = sent[0]!.attachments!
    expect(attachment).toMatchObject({ filename: 'quote-R-0007.pdf', contentType: 'application/pdf' })
    expect(pdfText(attachment!.content)).toBe(quoteText)
  })

  it('fails the job for good while mail is off', async () => {
    await expect(emailRepairQuote({ repairId: 7 }, contextWith(answering([])))).rejects.toThrow(FatalJobError)
  })
})
