import { describe, expect, it } from 'vitest'
import { ddlText } from './ddl'
import { settingsStoreNames } from './offline/settings-names'
import { createStepRecord, hadOf, recordSteps } from './step-record'

const names = settingsStoreNames({})

describe('the record of the store’s steps', () => {
  it('keeps one row per part of a step, by module, step and the module whose tables it changes', () => {
    expect(ddlText(createStepRecord(names))).toBe(`create table if not exists "auth"."auth_steps" (
  "module" text not null,
  "step" integer not null,
  "target" text not null,
  "applied_at" timestamptz,
  primary key ("module", "step", "target")
)`)
    expect(ddlText(recordSteps(names, [{ module: 'organizations', step: 1, target: 'personal_access_tokens' }]))).toBe(
      `insert into "auth"."auth_steps" ("module", "step", "target", "applied_at") values ('organizations', 1, 'personal_access_tokens', now())`,
    )
  })

  it('tells a step a module added to another module’s tables apart from the step’s own part', () => {
    const had = hadOf([{ module: 'organizations', step: 1, target: 'organizations' }])
    expect(had('organizations', 1, 'organizations')).toBe(true)
    expect(had('organizations', 1, 'personal_access_tokens')).toBe(false)
  })
})
