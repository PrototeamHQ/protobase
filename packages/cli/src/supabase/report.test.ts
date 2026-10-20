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
  realtimeTables: [{ schema: 'public', table: 'todos' }],
  untrustedExtensions: [],
  httpTriggers: [{ schema: 'public', table: 'todos', trigger: 'on_done', function: 'public.notify_done' }],
}

describe('importReport', () => {
  it('lists the rows loaded and what needs a person, with the size against the Starter plan', () => {
    const report = importReport(manifest, 'Checked 1 resources: 0 errors, 0 warnings.\n')
    expect(report).toContain('The imported tables take 600.0 MB in the source database, more than the 500.0 MB of the Starter plan: pick a larger plan.')
    expect(report).toContain('The migration leaves out 1 statement of the dump')
    expect(report).toContain('| auth.users | 2 |\n| public.todos | 3 |')
    expect(report).toContain('- purge, `0 3 * * *`: `delete from public.todos`')
    expect(report).toContain('## Vault secrets\n\nThe importing role could not read them')
    expect(report).toContain('## Untrusted extensions\n\nNone.')
    expect(report).toContain('- on_done on public.todos, calling public.notify_done')
    expect(report).toContain('- hello')
    expect(report).toContain('```\nChecked 1 resources: 0 errors, 0 warnings.\n```')
  })

  it('says when there was no config for doctor to check', () => {
    expect(importReport({ ...manifest, bytes: 1024 * 1024 }, undefined)).toContain('within the 500.0 MB of the Starter plan')
    expect(importReport(manifest, undefined)).toContain('No resources were scaffolded')
  })
})
