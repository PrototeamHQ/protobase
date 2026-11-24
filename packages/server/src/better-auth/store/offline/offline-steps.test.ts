import { describe, expect, it } from 'vitest'
import { resolveNames } from '../../names/resolve-names'
import { moduleSteps } from '../steps'
import { offlineStepsMigration, type SnapshotStore } from './offline-steps'
import { settingsStoreNames } from './settings-names'
import { latestSteps, type LastSteps } from './store-model'

const names = settingsStoreNames({})
const latest = latestSteps(names.names.modules)
const store = (lastSteps: LastSteps, stepRecord = true): SnapshotStore => ({ lastSteps, on: names.names.modules, stepRecord })

describe('offlineStepsMigration', () => {
  it('writes the record of steps, then every step and its row, for a store the snapshot has none of', () => {
    const migration = offlineStepsMigration(names, undefined)!
    expect(migration.sql).toMatch(/^-- The record of the auth store's steps\.\ncreate schema if not exists "auth";/)
    // A host may have made the store already, from the database, before the project's own migrations.
    expect(migration.sql).toContain('create table if not exists "auth"."auth_steps" (')
    expect(migration.sql).toContain('-- auth 1 core:')
    expect(migration.sql).toContain(`values ('auth', 5, 'auth', now())`)
    expect(migration.sql).not.toContain('auth_migrations')
    expect(migration.checks).toEqual([])
  })

  it('writes nothing once the snapshot has every step and the record of steps', () => {
    expect(offlineStepsMigration(names, store(latest))).toBeUndefined()
  })

  it('writes the record of steps, filled from auth_migrations, for a snapshot whose store has every step but no such record', () => {
    const migration = offlineStepsMigration(names, store(latest, false))!
    expect(migration.sql).toContain('create table if not exists "auth"."auth_steps" (')
    expect(migration.sql).toContain('-- The steps the store recorded by version in auth_migrations, recorded by step.')
    expect(migration.sql).not.toContain('-- auth ')
  })

  it("writes only the steps after the snapshot's, with the checks over rows the store has", () => {
    const migration = offlineStepsMigration(names, store({ ...latest, auth: 1 }))!
    expect(migration.sql).not.toContain('create table if not exists "auth"."auth_steps"')
    expect(migration.sql).not.toContain('-- auth 1 core')
    expect(migration.sql).toMatch(/^-- auth 2 account_keys:/)
    expect(migration.checks).toHaveLength(1)
    expect(migration.checks[0]).toContain('more than one account for a provider and account id')
  })

  it('runs each part only while auth_steps lacks it, so a database that has it skips it', () => {
    const migration = offlineStepsMigration(names, store({ ...latest, auth: 1 }))!
    expect(migration.sql).toContain(`-- auth 2 account_keys: One account per provider and account id, and per person where a provider links one.
do $step$ begin
if not exists (select from "auth"."auth_steps" where "module" = 'auth' and "step" = 2 and "target" = 'auth') then
execute $statement$do $check$`)
    expect(migration.sql).toContain(`execute $statement$insert into "auth"."auth_steps" ("module", "step", "target", "applied_at") values ('auth', 2, 'auth', now())$statement$;
end if;
end $step$;`)
  })

  it('refuses a step this version does not ship', () => {
    expect(() => offlineStepsMigration(names, store({ ...latest, auth: moduleSteps.auth.length + 1 }))).toThrow('The snapshot has step 6 of the auth module, which this version of Protobase does not ship; upgrade Protobase')
  })

  it('writes nothing of a module that is off, nor what other modules add to its tables', () => {
    const off = { ...names, names: resolveNames({ schema: 'auth', modules: ['auth', 'organizations'] }) }
    const migration = offlineStepsMigration(off, undefined)!
    expect(migration.sql).toContain('-- organizations 1 organizations')
    expect(migration.sql).not.toContain('personal_access_token')
    expect(migration.sql).not.toContain('-- passkeys')
  })

  it('writes again what a module adds to the tables of one that was off, which the guard skips where the database has it', () => {
    const migration = offlineStepsMigration(names, { lastSteps: latest, on: names.names.modules.filter((module) => module !== 'personal_access_tokens'), stepRecord: true })!
    expect(migration.sql).toMatch(/^-- organizations 1 organizations, on the tables of personal_access_tokens:/)
    expect(migration.sql).not.toContain('-- personal_access_tokens 1')
  })

  it('leaves the user table alone when the snapshot records it as a relation Protobase did not make', () => {
    const migration = offlineStepsMigration(names, store({ ...latest, auth: 2 }), true)!
    expect(migration.sql).toContain('-- auth 3 user_indexes:')
    expect(migration.sql).not.toContain('on "auth"."user"')
  })
})
