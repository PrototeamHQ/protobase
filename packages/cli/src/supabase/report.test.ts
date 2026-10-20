import { describe, expect, it } from 'vitest'
import type { ImportManifest } from './import-state'
import { importReport } from './report'

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
  cronJobs: [{ name: 'purge', schedule: '0 3 * * *', command: 'delete from public.todos' }],
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
}

describe('importReport', () => {
  it('lists the rows loaded and what needs a person, with the size against the Starter plan', () => {
    const report = importReport(manifest, 'Checked 1 resources: 0 errors, 0 warnings.\n')
    expect(report).toContain('The imported tables take 600.0 MB in the source database, more than the 500.0 MB of the Starter plan: pick a larger plan.')
    expect(report).toContain('The migration leaves out 1 statement of the dump')
    expect(report).toContain('| auth.users | 2 |\n| public.todos | 3 |')
    expect(report).toContain('- purge, `0 3 * * *`: `delete from public.todos`')
    expect(report).toContain('## Vault secrets\n\nThe importing role could not read them')
    expect(report).toContain('## Extensions left out\n\nNone.')
    expect(report).toContain('## Made again\n\nNone.')
    expect(report).toContain('- on_done on public.todos, calling public.notify_done')
    expect(report).toContain('- hello')
    expect(report).toContain('```\nChecked 1 resources: 0 errors, 0 warnings.\n```')
  })

  it('lists what the load made again, leaving for a person only what the database cannot run', () => {
    const report = importReport(withExtensions, undefined)
    expect(report).toContain('- Vault secret stripe_key: Stripe key\n- pgmq queue emails, with 2 messages\n- HTTP trigger on_done on public.todos, calling public.notify_done\n')
    expect(report).toContain('## Vault secrets\n\nNone.')
    expect(report).toContain('## pgmq queues\n\npgmq owns')
    expect(report).toContain('- events, partitioned, with 1 message\n')
    expect(report).toContain('## HTTP triggers\n\nNone.')
    expect(report).toContain('- plv8 (schema pg_catalog)')
    expect(report).toContain('- hypertable public.metrics, 100 rows in chunks the dump leaves out')
    expect(report).toContain('- function public.js_add, written in plv8: rewrite it in plpgsql or as a Protobase function')
    expect(report).not.toContain('sk_')
  })

  it('says when there was no config for doctor to check', () => {
    expect(importReport({ ...manifest, bytes: 1024 * 1024 }, undefined)).toContain('within the 500.0 MB of the Starter plan')
    expect(importReport(manifest, undefined)).toContain('No resources were scaffolded')
  })
})
