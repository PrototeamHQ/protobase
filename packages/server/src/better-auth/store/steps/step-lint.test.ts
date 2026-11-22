import { describe, expect, it } from 'vitest'
import { lintSteps } from './step-lint'

const step = (sql: string, { made = [] as string[], checked = false } = {}) => ({ label: 'step', sql, made, checked })
const rules = (sql: string, options?: { made?: string[]; checked?: boolean }) => lintSteps([step(sql, options)]).map(({ rule }) => rule)

describe('the step lint', () => {
  it('takes a new table, a nullable column, an index and a column with a default', () => {
    expect(rules('create table "a" (id text primary key, "x" text not null);\n\ncreate unique index "a_x_uidx" on "a" ("x");', { made: ['"a"'] })).toEqual([])
    expect(rules('alter table "s"."t" add column "x" text;\n\ncreate index "t_x_idx" on "s"."t" ("x");')).toEqual([])
    expect(rules(`alter table "t" add column "x" text default 'none' not null;`)).toEqual([])
  })

  it('refuses a drop', () => {
    expect(rules('alter table "t" drop column "x";')).toEqual(['ban-drop-column'])
    expect(rules('drop table "t";')).toEqual(['ban-drop-table'])
  })

  it('refuses a type change', () => {
    expect(rules('alter table "t" alter column "x" type bigint;')).toEqual(['changing-column-type'])
  })

  it('refuses a not null without a source', () => {
    expect(rules('alter table "t" add column "x" text not null;')).toEqual(['adding-required-field'])
    expect(rules('alter table "t" alter column "x" set not null;')).toEqual(['adding-not-nullable-field'])
  })

  it('refuses a unique constraint, and a unique index on a table with rows unless the step checks them first', () => {
    expect(rules('alter table "t" add constraint "t_x_key" unique ("x");')).toEqual(['disallowed-unique-constraint'])
    expect(rules('create unique index "t_x_uidx" on "s"."t" ("x");')).toEqual(['unique-index-without-check'])
    expect(rules('create unique index "t_x_uidx" on "s"."t" ("x");', { checked: true })).toEqual([])
    expect(rules('CREATE UNIQUE INDEX "t_x_uidx" ON "t" ("x");')).toEqual(['unique-index-without-check'])
    expect(rules('  create  unique index if not exists "t_x_uidx"\n  on "t" ("x");')).toEqual(['unique-index-without-check'])
    expect(rules('CREATE UNIQUE INDEX "a_x_uidx" ON "a" ("x");', { made: ['"a"'] })).toEqual([])
  })

  it('refuses a step it cannot parse', () => {
    expect(new Set(rules('create tabel "t" (id text);'))).toEqual(new Set(['syntax-error']))
  })

  it('names the step each finding is in', () => {
    const findings = lintSteps([step('create index "t_x_idx" on "t" ("x");'), { ...step('drop table "t";'), label: 'auth 9 drop' }])
    expect(findings).toEqual([{ step: 'auth 9 drop', rule: 'ban-drop-table', message: expect.any(String) }])
  })
})
