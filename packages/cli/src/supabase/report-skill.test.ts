import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { ImportManifest } from './import-state'
import { importReport } from './report'

const skillFile = path.resolve(import.meta.dirname, '../../skills/supabase-move/SKILL.md')

// An import whose report has every section: one pg_cron job converted, so the report has its Recurring jobs.
const manifest: ImportManifest = {
  migration: '004_supabase_schema.sql',
  schemas: ['auth', 'public', 'storage'],
  tables: [{ schema: 'public', table: 'todos', rows: 3 }],
  bytes: 1024,
  leftOut: 0,
  checkout: [],
  functions: { converted: [{ name: 'hello', public: false }], packages: [], left: [] },
  cronJobs: [{ id: 1, name: 'purge', schedule: '0 3 * * *', command: 'delete from public.todos', active: true, database: 'postgres', local: true, outcome: { kind: 'converted', name: 'purge', file: 'purge', exportName: 'purge', timezone: undefined } }],
  vaultSecrets: [],
  vaultReplayed: false,
  pgsodiumColumns: [],
  queues: [],
  queuesReplayed: false,
  realtimeTables: [],
  extensionsLeftOut: [],
  httpTriggers: [],
  httpSent: false,
  hypertables: [],
  routinesLeftOut: [],
}

const headings = (markdown: string, level: string) => [...markdown.matchAll(new RegExp(`^${level} (.+)$`, 'gm'))].map((match) => match[1])

describe('the supabase-move skill', () => {
  it("has a section for each of the import report's sections, in the report's order", async () => {
    const skill = await readFile(skillFile, 'utf8')
    const bySection = skill.slice(skill.indexOf('\n## The report, section by section\n'))
    expect(headings(bySection, '###')).toEqual(headings(importReport(manifest, '', true, ['public.todos'], []), '##'))
  })
})
