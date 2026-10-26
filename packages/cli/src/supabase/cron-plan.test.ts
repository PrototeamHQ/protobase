import { isSchedule } from '@protobase/server'
import { describe, expect, it } from 'vitest'
import { calledSchemas, convertedCronJobs, cronPlan, unavailableSchemas, type CronPlanOptions } from './cron-plan'
import type { CronJob } from './source-facts'

const job = (id: number, name: string | null, schedule: string, command: string, extra: Partial<CronJob> = {}): CronJob => ({
  id,
  name,
  schedule,
  command,
  active: true,
  database: 'postgres',
  local: true,
  ...extra,
})

const bare = { httpSent: false, webhooks: false, vault: false, queues: false }
const converting: CronPlanOptions = { pgCron: false, target: bare, timezone: 'GMT', isSchedule }

describe('cronPlan', () => {
  it('makes a job of plain SQL a recurring job of the same name, schedule and SQL, in UTC', () => {
    const [planned] = cronPlan([job(1, 'purge-done', '0 3 * * *', 'delete from public.todos where done')], converting)
    expect(planned!.outcome).toEqual({ kind: 'converted', name: 'purge-done', file: 'purge-done', timezone: undefined })
    expect(convertedCronJobs([planned!])).toEqual([{ name: 'purge-done', file: 'purge-done', timezone: undefined, schedule: '0 3 * * *', command: 'delete from public.todos where done' }])
  })

  it("keeps pg_cron's time zone, when the project set one", () => {
    const [planned] = cronPlan([job(1, 'morning', '0 7 * * *', 'select 1')], { ...converting, timezone: 'Europe/Amsterdam' })
    expect(planned!.outcome).toMatchObject({ kind: 'converted', timezone: 'Europe/Amsterdam' })
  })

  it('names an unnamed job by its id, and makes names a file and an export can hold', () => {
    const planned = cronPlan(
      [job(7, null, '* * * * *', 'select 1'), job(8, 'Nightly Report!', '0 0 * * *', 'select 2'), job(9, '2fa cleanup', '0 0 * * *', 'select 3'), job(10, 'delete', '0 0 * * *', 'select 4')],
      converting,
    )
    expect(planned.map((one) => one.outcome)).toEqual([
      { kind: 'converted', name: 'cron-job-7', file: 'cron-job-7', timezone: undefined },
      { kind: 'converted', name: 'Nightly-Report-', file: 'nightly-report', timezone: undefined },
      { kind: 'converted', name: '2fa-cleanup', file: '2fa-cleanup', timezone: undefined },
      { kind: 'converted', name: 'delete', file: 'delete', timezone: undefined },
    ])
  })

  it('tells apart jobs whose names become the same', () => {
    const planned = cronPlan([job(1, 'a b', '* * * * *', 'select 1'), job(2, 'a-b', '* * * * *', 'select 2'), job(3, 'a/b', '* * * * *', 'select 3')], converting)
    expect(planned.map((one) => one.outcome)).toEqual([
      { kind: 'converted', name: 'a-b', file: 'a-b', timezone: undefined },
      { kind: 'converted', name: 'a-b-2', file: 'a-b-2', timezone: undefined },
      { kind: 'converted', name: 'a/b', file: 'a-b-3', timezone: undefined },
    ])
  })

  it("leaves a job calling pg_net or Supabase's internals, an inactive one and a schedule Protobase does not take", () => {
    const planned = cronPlan(
      [
        job(1, 'ping', '*/5 * * * *', "select net.http_post(url := 'https://example.com/hook')"),
        job(2, 'clean-runs', '0 0 * * *', "delete from cron.job_run_details where end_time < now() - interval '7 days'"),
        job(3, 'paused', '0 0 * * *', 'select 1', { active: false }),
        job(4, 'often', '30 seconds', 'select 1'),
        job(5, 'month-end', '0 0 $ * *', 'select 1'),
      ],
      converting,
    )
    expect(planned.map((one) => one.outcome)).toEqual([
      { kind: 'left', reason: "calls net, which the project's database lacks: rewrite it as a Protobase job" },
      { kind: 'left', reason: "calls cron, which the project's database lacks: rewrite it as a Protobase job" },
      { kind: 'left', reason: 'inactive on Supabase, so not converted' },
      { kind: 'left', reason: "Protobase's recurring jobs do not take this schedule: give it a cron schedule" },
      { kind: 'left', reason: "Protobase's recurring jobs do not take this schedule: give it a cron schedule" },
    ])
  })

  it('converts a job calling pg_net where the project database has it', () => {
    const [planned] = cronPlan([job(1, 'ping', '*/5 * * * *', "select net.http_get('https://example.com')")], { ...converting, target: { ...bare, httpSent: true } })
    expect(planned!.outcome.kind).toBe('converted')
  })

  it('schedules every job again where the project database has pg_cron, all but those of another database', () => {
    const planned = cronPlan(
      [job(1, 'ping', '30 seconds', "select net.http_post('https://example.com')"), job(2, 'paused', '0 0 * * *', 'select 1', { active: false }), job(3, 'other', '0 0 * * *', 'select 1', { database: 'reports', local: false })],
      { ...converting, pgCron: true },
    )
    expect(planned.map((one) => one.outcome)).toEqual([
      { kind: 'rescheduled' },
      { kind: 'rescheduled' },
      { kind: 'left', reason: 'runs in the database reports, which the import does not carry over' },
    ])
    expect(convertedCronJobs(planned)).toEqual([])
  })
})

describe('calledSchemas', () => {
  it('finds objects of a schema, quoted or not, and not a table or column of the same name', () => {
    const schemas = unavailableSchemas(bare)
    expect(calledSchemas('SELECT "net"."http_get"(\'x\')', schemas)).toEqual(['net'])
    expect(calledSchemas('select vault.decrypted_secrets', schemas)).toEqual(['vault'])
    expect(calledSchemas('select n.net from public.net n; select public.net.x', schemas)).toEqual([])
    expect(calledSchemas('select pgmq.send(1)', unavailableSchemas({ ...bare, queues: true }))).toEqual([])
  })
})
