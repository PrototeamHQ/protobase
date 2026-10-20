import { describe, expect, it } from 'vitest'
import type { ImportManifest } from './import-state'
import { importReport } from './report'

const cronJob = { id: 1, schedule: '0 3 * * *', active: true, database: 'postgres', local: true }

const manifest: ImportManifest = {
  migration: '004_supabase_schema.sql',
  schemas: ['auth', 'public', 'storage'],
  tables: [
    { schema: 'auth', table: 'users', rows: 2 },
    { schema: 'public', table: 'todos', rows: 3 },
  ],
  bytes: 600 * 1024 * 1024,
  leftOut: 1,
  checkout: ['supabase/config.toml'],
  functions: ['hello'],
  cronJobs: [
    { ...cronJob, name: 'purge', command: 'delete from public.todos', outcome: { kind: 'converted', name: 'purge', file: 'purge', exportName: 'purge', timezone: undefined } },
    { ...cronJob, id: 2, name: 'ping', command: "select net.http_get('https://example.com')", outcome: { kind: 'left', reason: "calls net, which the project's database lacks" } },
  ],
  vaultSecrets: undefined,
  vaultReplayed: false,
  queues: [],
  queuesReplayed: false,
  realtimeTables: [{ schema: 'public', table: 'todos' }],
  extensionsLeftOut: [],
  httpTriggers: [{ schema: 'public', table: 'todos', trigger: 'on_done', function: 'public.notify_done' }],
  httpSent: false,
  hypertables: [],
  routinesLeftOut: [],
}

/** The same import into a database with Vault, pgmq and pg_net, from a Supabase 15 project. */
const withExtensions: ImportManifest = {
  ...manifest,
  vaultSecrets: [{ name: 'stripe_key', description: 'Stripe key' }],
  vaultReplayed: true,
  queues: [
    { name: 'emails', partitioned: false, messages: 2 },
    { name: 'events', partitioned: true, messages: 1 },
  ],
  queuesReplayed: true,
  httpSent: true,
  extensionsLeftOut: [{ name: 'plv8', schema: 'pg_catalog' }],
  hypertables: [{ schema: 'public', table: 'metrics', rows: 100 }],
  routinesLeftOut: [{ name: 'public.js_add', language: 'plv8' }],
  cronJobs: [
    { ...cronJob, name: 'purge', command: 'delete from public.todos', outcome: { kind: 'rescheduled' } },
    { ...cronJob, id: 2, name: null, command: 'select 1', active: false, outcome: { kind: 'rescheduled' } },
  ],
}

describe('importReport', () => {
  it('lists the rows loaded and what needs a person, with the size against the Starter plan', () => {
    const report = importReport(manifest, 'Checked 1 resources: 0 errors, 0 warnings.\n', true)
    expect(report).toContain('The imported tables take 600.0 MB in the source database, more than the 500.0 MB of the Starter plan: pick a larger plan.')
    expect(report).toContain('The migration leaves out 1 statement of the dump')
    expect(report).toContain('| auth.users | 2 |\n| public.todos | 3 |')
    expect(report).toContain("- pg_cron job purge, `0 3 * * *`, as the recurring job `jobs/purge.ts`")
    expect(report).toContain('## Recurring jobs\n\nThe import wrote')
    expect(report).toContain('`protobase.config.ts` passes them as its `jobs`.')
    expect(report).toContain("## Cron jobs\n\nThese pg_cron jobs did not come over, each for the reason it gives. Make each a Protobase recurring job, or schedule it where the database has pg_cron.\n\n- ping, `0 3 * * *`: `select net.http_get('https://example.com')`, calls net, which the project's database lacks\n")
    expect(report).toContain('## Vault secrets\n\nThe importing role could not read them')
    expect(report).toContain('## Extensions left out\n\nNone.')
    expect(report).toContain('- on_done on public.todos, calling public.notify_done')
    expect(report).toContain('- hello')
    expect(report).toContain('```\nChecked 1 resources: 0 errors, 0 warnings.\n```')
  })

  it('lists what the load made again, leaving for a person only what the database cannot run', () => {
    const report = importReport(withExtensions, undefined, true)
    expect(report).toContain('- pg_cron job purge, `0 3 * * *`\n- pg_cron job unnamed, `0 3 * * *`, inactive\n- Vault secret stripe_key: Stripe key\n- pgmq queue emails, with 2 messages\n- HTTP trigger on_done on public.todos, calling public.notify_done\n')
    expect(report).toContain('## Vault secrets\n\nNone.')
    expect(report).toContain('## pgmq queues\n\npgmq owns')
    expect(report).toContain('- events, partitioned, with 1 message\n')
    expect(report).toContain('## HTTP triggers\n\nNone.')
    expect(report).toContain('## Cron jobs\n\nNone.')
    expect(report).not.toContain('## Recurring jobs')
    expect(report).toContain('- plv8 (schema pg_catalog)')
    expect(report).toContain('- hypertable public.metrics, 100 rows in chunks the dump leaves out')
    expect(report).toContain('- function public.js_add, written in plv8: rewrite it in plpgsql or as a Protobase function')
    expect(report).not.toContain('sk_')
  })

  it('says when there was no config for doctor to check', () => {
    expect(importReport({ ...manifest, bytes: 1024 * 1024 }, undefined, true)).toContain('within the 500.0 MB of the Starter plan')
    expect(importReport(manifest, undefined, true)).toContain('No resources were scaffolded')
  })

  it("says to add the jobs to a config with jobs of its own, and that the role could not read pg_cron's", () => {
    expect(importReport(manifest, undefined, false)).toContain('`protobase.config.ts` has a `jobs` of its own: add the exports of `jobs/index.ts` to it.')
    expect(importReport({ ...manifest, cronJobs: undefined }, undefined, true)).toContain('## Cron jobs\n\nThe importing role could not read them')
  })
})
