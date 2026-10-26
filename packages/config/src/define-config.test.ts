import { describe, expect, expectTypeOf, it } from 'vitest'
import type { Db } from '@protobase/query'
import type { EnqueueJob, JobName, JobPayload } from '@protobase/server'
import { defineConfig } from './index'

const config = defineConfig({
  timezone: 'Europe/Amsterdam',
  jobs: {
    'mark-invoice-overdue': { arguments: { invoiceId: 'bigint', notes: { type: 'text', optional: true } } },
    'email-alerts': { arguments: { userId: 'integer', frequency: { type: 'enum', values: ['daily', 'instant'] }, dryRun: { type: 'boolean', optional: true } } },
    'nightly-report': { schedule: '0 2 * * *' },
  },
})

const fromFunction = defineConfig(async ({ env }) => ({ timezone: env.TZ, jobs: { 'sync-customer': { arguments: { customerId: 'uuid' } } } }))

// Only the types matter here: enqueue is never called.
declare const enqueue: EnqueueJob<typeof config>
declare const db: Db

describe('defineConfig', () => {
  it('returns the config as it is', () => {
    expect(defineConfig(config)).toBe(config)
  })

  it('keeps the jobs as written, so their names and payloads are typed', () => {
    expectTypeOf<JobName<typeof config>>().toEqualTypeOf<'mark-invoice-overdue' | 'email-alerts' | 'nightly-report'>()
    expectTypeOf<JobPayload<typeof config, 'mark-invoice-overdue'>>().toEqualTypeOf<{ invoiceId: string; notes?: string }>()
    expectTypeOf<JobPayload<typeof config, 'email-alerts'>>().toEqualTypeOf<{ userId: number; frequency: 'daily' | 'instant'; dryRun?: boolean }>()
    expectTypeOf<JobPayload<typeof config, 'nightly-report'>>().toEqualTypeOf<Record<string, unknown>>()
    expectTypeOf<JobName<typeof fromFunction>>().toEqualTypeOf<'sync-customer'>()
    expectTypeOf<JobPayload<typeof fromFunction, 'sync-customer'>>().toEqualTypeOf<{ customerId: string }>()
  })

  it('types enqueueJob with them', () => {
    const typed = () => {
      void enqueue(db, 'mark-invoice-overdue', { invoiceId: '7' }, { key: 'invoice:7' })
      void enqueue(db, 'email-alerts', { userId: 3, frequency: 'daily' })
      void enqueue(db, 'nightly-report')
      // @ts-expect-error a job the config does not declare
      void enqueue(db, 'mark-invoices-overdue', { invoiceId: '7' })
      // @ts-expect-error a required argument left out
      void enqueue(db, 'mark-invoice-overdue', {})
      // @ts-expect-error the payload of a job with a required argument left out
      void enqueue(db, 'mark-invoice-overdue')
      // @ts-expect-error a value outside the enum
      void enqueue(db, 'email-alerts', { userId: 3, frequency: 'weekly' })
      // @ts-expect-error a number where a bigint argument takes a string
      void enqueue(db, 'mark-invoice-overdue', { invoiceId: 7 })
      // @ts-expect-error an argument the job does not take
      void enqueue(db, 'mark-invoice-overdue', { invoiceId: '7', amount: 1 })
    }
    expect(typed).toBeTypeOf('function')
  })

  it('still refuses a key no config has', () => {
    // @ts-expect-error a misspelt key
    expect(defineConfig({ timezon: 'UTC' })).toEqual({ timezon: 'UTC' })
    // @ts-expect-error an argument type that does not exist
    expect(defineConfig({ jobs: { a: { arguments: { n: 'integr' } } } })).toBeTruthy()
  })
})
