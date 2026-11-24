import { describe, expect, it } from 'vitest'
import { moduleSteps } from '../steps'
import { offlineStepsMigration } from './offline-steps'
import { settingsStoreNames } from './settings-names'
import { latestSteps } from './store-model'

const names = settingsStoreNames({})
const latest = latestSteps(names.names.modules)

describe('offlineStepsMigration', () => {
  it('writes the record of migrations, then every step and its row, for a store the snapshot has none of', () => {
    const migration = offlineStepsMigration(names, undefined)!
    expect(migration.sql).toMatch(/^-- The record of the auth store's migrations\.\ncreate schema if not exists "auth";/)
    // A host may have made the store already, from the database, before the project's own migrations.
    expect(migration.sql).toContain('create table if not exists "auth"."auth_migrations" (')
    expect(migration.sql).toContain('-- auth 1 core:')
    expect(migration.sql).toContain(`values (14, 'user_name_search')`)
    expect(migration.checks).toEqual([])
  })

  it('writes nothing once the snapshot has every step', () => {
    expect(offlineStepsMigration(names, latest)).toBeUndefined()
  })

  it("writes only the steps after the snapshot's, with the checks over rows the store has", () => {
    const migration = offlineStepsMigration(names, { ...latest, auth: 1 })!
    expect(migration.sql).not.toContain('create table if not exists "auth"."auth_migrations"')
    expect(migration.sql).not.toContain('-- auth 1 core')
    expect(migration.sql).toMatch(/^-- auth 2 account_keys:/)
    expect(migration.sql).toContain(`values (11, 'account_keys')`)
    expect(migration.checks).toHaveLength(1)
    expect(migration.checks[0]).toContain('more than one account for a provider and account id')
  })

  it('runs each step only while auth_migrations lacks its version, so a database that has it skips it', () => {
    const migration = offlineStepsMigration(names, { ...latest, auth: 1 })!
    expect(migration.sql).toContain(`-- auth 2 account_keys: One account per provider and account id, and per person where a provider links one.
do $version$ begin
if not exists (select from "auth"."auth_migrations" where "version" = 11) then
execute $statement$do $check$`)
    expect(migration.sql).toContain(`execute $statement$insert into "auth"."auth_migrations" ("version", "name") values (11, 'account_keys')$statement$;
end if;
end $version$;`)
  })

  it('refuses a step this version does not ship', () => {
    expect(() => offlineStepsMigration(names, { ...latest, auth: moduleSteps.auth.length + 1 })).toThrow('The snapshot has step 6 of the auth module, which this version of Protobase does not ship; upgrade Protobase')
  })

  it('refuses while a module is off', () => {
    const off = settingsStoreNames({})
    expect(() => offlineStepsMigration({ ...off, names: { ...off.names, modules: ['auth'] } }, undefined)).toThrow('is off')
  })
})
